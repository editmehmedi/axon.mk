import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession, hashPassword, verifyPassword, getSession, destroySession } from "@/lib/auth";
import { sendVerificationEmail } from "@/lib/email";
import {
  canResendVerification,
  emailCodesMatch,
  generateEmailCode,
  hashEmailCode,
  resendWaitSeconds,
  VERIFY_CODE_TTL_MS,
} from "@/lib/email-verify";

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const verifySchema = z.object({
  email: z.string().email(),
  code: z.string().trim().regex(/^\d{6}$/),
});

const resendSchema = z.object({
  email: z.string().email(),
});

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function issueVerificationCode(user: { id: string; email: string; name: string }) {
  const code = generateEmailCode();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerifyCode: hashEmailCode(user.email, code),
      emailVerifyExpiresAt: new Date(Date.now() + VERIFY_CODE_TTL_MS),
    },
  });
  try {
    await sendVerificationEmail({ to: user.email, name: user.name, code });
  } catch (err) {
    console.error("[email] failed to send verification code", err);
  }
}

function needsVerificationResponse(email: string, extra?: Record<string, unknown>) {
  return NextResponse.json(
    { error: "EMAIL_NOT_VERIFIED", needsVerification: true, email, ...extra },
    { status: 403 },
  );
}

export async function POST_register(req: Request) {
  const body = registerSchema.parse(await req.json());
  const email = normalizeEmail(body.email);
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing?.emailVerifiedAt) {
    return NextResponse.json({ error: "EMAIL_EXISTS" }, { status: 400 });
  }

  const passwordHash = await hashPassword(body.password);
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          name: body.name,
          phone: body.phone,
          passwordHash,
        },
      })
    : await prisma.user.create({
        data: {
          name: body.name,
          email,
          phone: body.phone,
          passwordHash,
          role: "user",
        },
      });

  if (!canResendVerification(user.emailVerifyExpiresAt)) {
    return NextResponse.json({
      needsVerification: true,
      email: user.email,
      retryAfter: resendWaitSeconds(user.emailVerifyExpiresAt),
    });
  }

  await issueVerificationCode(user);
  return NextResponse.json({ needsVerification: true, email: user.email });
}

export async function POST_login(req: Request) {
  const body = loginSchema.parse(await req.json());
  const email = normalizeEmail(body.email);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
    return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  }

  if (!user.emailVerifiedAt) {
    if (!user.emailVerifyExpiresAt || user.emailVerifyExpiresAt < new Date()) {
      await issueVerificationCode(user);
    }
    return needsVerificationResponse(user.email);
  }

  await createSession({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });
  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
}

export async function POST_verifyEmail(req: Request) {
  const body = verifySchema.parse(await req.json());
  const email = normalizeEmail(body.email);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ error: "CODE_INVALID" }, { status: 400 });
  }
  if (user.emailVerifiedAt) {
    await createSession({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  }
  if (!user.emailVerifyExpiresAt || user.emailVerifyExpiresAt < new Date()) {
    return NextResponse.json({ error: "CODE_EXPIRED" }, { status: 400 });
  }
  if (!emailCodesMatch(user.email, body.code, user.emailVerifyCode)) {
    return NextResponse.json({ error: "CODE_INVALID" }, { status: 400 });
  }

  const verified = await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerifiedAt: new Date(),
      emailVerifyCode: null,
      emailVerifyExpiresAt: null,
    },
  });
  await createSession({
    id: verified.id,
    email: verified.email,
    name: verified.name,
    role: verified.role,
  });
  return NextResponse.json({
    user: { id: verified.id, email: verified.email, name: verified.name, role: verified.role },
  });
}

export async function POST_resendCode(req: Request) {
  const body = resendSchema.parse(await req.json());
  const email = normalizeEmail(body.email);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.emailVerifiedAt) {
    return NextResponse.json({ ok: true });
  }
  if (!canResendVerification(user.emailVerifyExpiresAt)) {
    return NextResponse.json(
      { error: "RESEND_WAIT", retryAfter: resendWaitSeconds(user.emailVerifyExpiresAt) },
      { status: 429 },
    );
  }
  await issueVerificationCode(user);
  return NextResponse.json({ ok: true });
}

export async function GET_me() {
  const user = await getSession();
  if (!user) return NextResponse.json({ user: null });
  const full = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, email: true, name: true, phone: true, role: true },
  });
  return NextResponse.json({ user: full });
}

const profileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(40).optional(),
});

export async function PATCH_me(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const body = profileSchema.parse(await req.json());
  const user = await prisma.user.update({
    where: { id: session.id },
    data: {
      name: body.name,
      phone: body.phone ? body.phone : null,
    },
    select: { id: true, email: true, name: true, phone: true, role: true },
  });
  await createSession({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });
  return NextResponse.json({ user });
}

export async function POST_logout() {
  await destroySession();
  return NextResponse.json({ ok: true });
}
