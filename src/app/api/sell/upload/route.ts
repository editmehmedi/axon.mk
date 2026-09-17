import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { saveUploadedImage, UploadError } from "@/lib/uploadImage";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await requireUser();

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const url = await saveUploadedImage(file);
    return NextResponse.json({ url }, { status: 201 });
  } catch (e) {
    if (e instanceof UploadError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json(
      { error: msg === "UNAUTHORIZED" || msg === "FORBIDDEN" ? msg : "Upload failed" },
      { status },
    );
  }
}
