import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireHeadAdmin, assignHeadAdmin } from "@/lib/auth";

const updateSchema = z.object({
  userId: z.string(),
  role: z.enum(["user", "admin", "head_admin"]),
});

export async function PATCH(req: Request) {
  try {
    await requireHeadAdmin();
    const data = updateSchema.parse(await req.json());

    if (data.role === "head_admin") {
      const user = await assignHeadAdmin(data.userId);
      return NextResponse.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          isHeadAdmin: user.isHeadAdmin,
        },
      });
    }

    const current = await prisma.user.findUnique({ where: { id: data.userId } });
    if (current?.isHeadAdmin) {
      return NextResponse.json(
        { error: "Не може да се симне единствениот head_admin без трансфер" },
        { status: 400 }
      );
    }

    const user = await prisma.user.update({
      where: { id: data.userId },
      data: { role: data.role, isHeadAdmin: false },
    });

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isHeadAdmin: user.isHeadAdmin,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    if (msg === "HEAD_ADMIN_EXISTS") {
      return NextResponse.json(
        { error: "Веќе постои head_admin (partial unique index)" },
        { status: 409 }
      );
    }
    const status = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
