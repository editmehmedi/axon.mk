import { z } from "zod";
import { answerChat, chatConfigured, isItConversation, localShopAnswer, refusalText } from "@/lib/itChat";

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  locale: z.enum(["en", "sq", "mk"]).default("en"),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(8000),
      }),
    )
    .min(1)
    .max(16),
});

const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((time) => now - time < 10 * 60 * 1000);
  if (recent.length >= 20) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

const textHeaders = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(ip)) {
    return Response.json({ error: "rate" }, { status: 429 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  if (body.messages.at(-1)?.role !== "user") {
    return Response.json({ error: "invalid" }, { status: 400 });
  }

  if (!isItConversation(body.messages)) {
    return new Response(refusalText(body.locale), { headers: textHeaders });
  }
  if (!chatConfigured()) {
    try {
      const reply = await localShopAnswer(body.locale, body.messages);
      return new Response(reply, { headers: textHeaders });
    } catch (error) {
      console.error("[chat local]", error);
      return Response.json({ error: "failed" }, { status: 500 });
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let sent = false;
      const write = (text: string) => {
        if (!text) return;
        controller.enqueue(encoder.encode(text));
        sent = true;
      };
      try {
        for await (const chunk of answerChat(body.locale, body.messages)) {
          write(chunk);
        }
      } catch (error) {
        console.error("[chat]", error);
      }
      if (!sent) {
        try {
          write(await localShopAnswer(body.locale, body.messages));
        } catch (error) {
          console.error("[chat local]", error);
        }
      }
      try {
        controller.close();
      } catch {
        // The browser already stopped reading.
      }
    },
  });

  return new Response(stream, { headers: textHeaders });
}
