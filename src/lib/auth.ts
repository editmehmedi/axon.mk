import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { Role } from "@/generated/prisma";
import { prisma } from "./db";

const COOKIE = "axon_session";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSession(user: SessionUser) {
  const token = await new SignJWT({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const id = String(payload.id ?? "");
    if (!id || id === "undefined") return null;
    // JWT can outlive a db reset/seed — never trust id/role from the cookie alone.
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, role: true },
    });
    return user;
  } catch {
    return null;
  }
}

export async function requireUser() {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHORIZED");
  return session;
}

export async function requireAdmin() {
  const session = await requireUser();
  if (session.role !== "admin" && session.role !== "head_admin") {
    throw new Error("FORBIDDEN");
  }
  return session;
}

export async function requireHeadAdmin() {
  const session = await requireUser();
  if (session.role !== "head_admin") throw new Error("FORBIDDEN");
  return session;
}

/** Enforce at most one head_admin (partial unique index semantics). */
export async function assignHeadAdmin(userId: string) {
  const existing = await prisma.user.findFirst({
    where: { isHeadAdmin: true, NOT: { id: userId } },
  });
  if (existing) {
    throw new Error("HEAD_ADMIN_EXISTS");
  }
  return prisma.user.update({
    where: { id: userId },
    data: { role: "head_admin", isHeadAdmin: true },
  });
}
