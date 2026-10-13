import { z } from "zod";
import { explainBuild } from "@/lib/buildCheck";
import type { CompatPart, CompatSelection } from "@/lib/compatibility";
import { chatConfigured } from "@/lib/itChat";

export const runtime = "nodejs";
export const maxDuration = 60;

const partSchema = z.object({
  id: z.string().trim().min(1).max(120),
  category: z.enum(["CPU", "COOLER", "MOTHERBOARD", "RAM", "GPU", "PSU", "CASE", "SSD"]),
  name: z.string().trim().min(1).max(300),
  brand: z.string().trim().max(80).nullable().optional(),
  socket: z.string().trim().max(40).nullable().optional(),
  ramType: z.string().trim().max(20).nullable().optional(),
  wattage: z.number().min(0).max(5000).nullable().optional(),
  tdpWatts: z.number().min(0).max(1000).nullable().optional(),
  formFactor: z.string().trim().max(40).nullable().optional(),
  includesCooler: z.boolean().nullable().optional(),
});

const bodySchema = z.object({
  locale: z.enum(["en", "sq", "mk"]).default("en"),
  ramQty: z.number().int().min(1).max(8).default(1),
  ssdQty: z.number().int().min(1).max(8).default(1),
  selection: z.object({
    CPU: partSchema.nullable().optional(),
    COOLER: partSchema.nullable().optional(),
    MOTHERBOARD: partSchema.nullable().optional(),
    RAM: partSchema.nullable().optional(),
    GPU: partSchema.nullable().optional(),
    PSU: partSchema.nullable().optional(),
    CASE: partSchema.nullable().optional(),
    SSD: z.array(partSchema).max(4).nullable().optional(),
  }),
});

const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((time) => now - time < 10 * 60 * 1000);
  if (recent.length >= 30) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

function asPart(part: z.infer<typeof partSchema> | null | undefined): CompatPart | null {
  if (!part) return null;
  return part;
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(ip)) {
    return Response.json({ error: "rate" }, { status: 429 });
  }
  if (!chatConfigured()) {
    console.error("[build-check] GEMINI_API_KEY is missing");
    return Response.json({ error: "offline" }, { status: 503 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return Response.json({ error: "invalid" }, { status: 400 });
  }

  const selection: CompatSelection = {
    CPU: asPart(body.selection.CPU),
    COOLER: asPart(body.selection.COOLER),
    MOTHERBOARD: asPart(body.selection.MOTHERBOARD),
    RAM: asPart(body.selection.RAM),
    GPU: asPart(body.selection.GPU),
    PSU: asPart(body.selection.PSU),
    CASE: asPart(body.selection.CASE),
    SSD: body.selection.SSD?.map((part) => part) ?? null,
  };
  const picked = Object.values(selection).flatMap((value) => (Array.isArray(value) ? value : value ? [value] : []));
  if (picked.filter((part) => !part.id.startsWith("none:")).length < 2) {
    return Response.json({ error: "incomplete" }, { status: 400 });
  }

  try {
    const result = await explainBuild(body.locale, selection, {
      ramQty: body.ramQty,
      ssdQty: body.ssdQty,
    });
    return Response.json(result);
  } catch (error) {
    const failure = error as { message?: string; status?: number; name?: string };
    const message = (failure.message ?? String(error)).replace(/AIza[\w-]+|AQ\.[A-Za-z0-9_-]+/g, "[redacted]");
    console.error("[build-check] request failed", {
      name: failure.name,
      status: failure.status,
      message: message.slice(0, 800),
    });
    return Response.json({ error: "failed" }, { status: 502 });
  }
}
