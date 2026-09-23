/** Hide seed placeholders so the public site never shows a fake phone line. */
export function publicPhone(phone: string | null | undefined): string | null {
  const value = phone?.trim() ?? "";
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8) return null;
  if (digits.endsWith("70123456") || digits.endsWith("70000000")) return null;
  return value;
}
