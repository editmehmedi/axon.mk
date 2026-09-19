import crypto from "crypto";

export const VERIFY_CODE_TTL_MS = 15 * 60 * 1000;
export const VERIFY_RESEND_WAIT_MS = 60 * 1000;

export function generateEmailCode(): string {
  return crypto.randomInt(100000, 1_000_000).toString();
}

export function hashEmailCode(email: string, code: string): string {
  const secret = process.env.AUTH_SECRET || "axon";
  return crypto
    .createHmac("sha256", secret)
    .update(`${email.toLowerCase()}:${code.trim()}`)
    .digest("hex");
}

export function emailCodesMatch(email: string, code: string, storedHash: string | null): boolean {
  if (!storedHash) return false;
  const next = hashEmailCode(email, code);
  const a = Buffer.from(storedHash);
  const b = Buffer.from(next);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function canResendVerification(expiresAt: Date | null): boolean {
  if (!expiresAt) return true;
  const sentAt = expiresAt.getTime() - VERIFY_CODE_TTL_MS;
  return Date.now() - sentAt >= VERIFY_RESEND_WAIT_MS;
}

export function resendWaitSeconds(expiresAt: Date | null): number {
  if (!expiresAt) return 0;
  const sentAt = expiresAt.getTime() - VERIFY_CODE_TTL_MS;
  const wait = VERIFY_RESEND_WAIT_MS - (Date.now() - sentAt);
  return Math.max(0, Math.ceil(wait / 1000));
}
