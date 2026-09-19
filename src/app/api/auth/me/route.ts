import { GET_me, PATCH_me } from "@/lib/auth-handlers";
import { NextResponse } from "next/server";
import { z } from "zod";

export async function GET() {
  return GET_me();
}

export async function PATCH(req: Request) {
  try {
    return await PATCH_me(req);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "INVALID_NAME" }, { status: 400 });
    }
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
