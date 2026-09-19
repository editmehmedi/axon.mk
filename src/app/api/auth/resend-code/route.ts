import { NextResponse } from "next/server";
import { POST_resendCode } from "@/lib/auth-handlers";

export async function POST(req: Request) {
  try {
    return await POST_resendCode(req);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
