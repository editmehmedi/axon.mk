import type { TranslationKey } from "@/lib/i18n";

/** Canonical note keys stored on new orders */
export const ORDER_NOTE = {
  PREBUILT_CREATED: "order.note.prebuiltCreated",
  CUSTOM_CREATED: "order.note.customCreated",
  AWAITING_PHONE: "order.note.awaitingPhone",
  CUSTOM_AWAITING: "order.note.customAwaiting",
} as const;

const LEGACY_NOTE_MAP: Record<string, TranslationKey> = {
  // Current / English
  [ORDER_NOTE.PREBUILT_CREATED]: ORDER_NOTE.PREBUILT_CREATED,
  [ORDER_NOTE.CUSTOM_CREATED]: ORDER_NOTE.CUSTOM_CREATED,
  [ORDER_NOTE.AWAITING_PHONE]: ORDER_NOTE.AWAITING_PHONE,
  [ORDER_NOTE.CUSTOM_AWAITING]: ORDER_NOTE.CUSTOM_AWAITING,
  "Order created. Our verification team will call you.": ORDER_NOTE.PREBUILT_CREATED,
  "Custom order created. Phone verification pending.": ORDER_NOTE.CUSTOM_CREATED,
  "Automatic: awaiting phone verification.": ORDER_NOTE.AWAITING_PHONE,
  "Professional assembly + testing. Awaiting verification.": ORDER_NOTE.CUSTOM_AWAITING,
  // Legacy Macedonian (old seed / orders)
  "Нарачка креирана. Тим за верификација ќе ве контактира.": ORDER_NOTE.PREBUILT_CREATED,
  "Custom нарачка креирана. Верификација преку телефон.": ORDER_NOTE.CUSTOM_CREATED,
  "Автоматски: чека телефонска верификација.": ORDER_NOTE.AWAITING_PHONE,
  "Професионално склопување + testing. Чека верификација.": ORDER_NOTE.CUSTOM_AWAITING,
  "Нарачката е примена — чека телефонска верификација.": ORDER_NOTE.PREBUILT_CREATED,
  "Деловите се подготвени од залиха.": "order.note.partsReady",
  "PC е во склопување и stress testing.": "order.note.building",
  "COD нарачка креирана. Тим за верификација ќе ве контактира.": ORDER_NOTE.PREBUILT_CREATED,
};

export function localizeOrderNote(
  note: string | null | undefined,
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
): string | null {
  if (!note?.trim()) return null;
  const key = LEGACY_NOTE_MAP[note.trim()];
  if (key) return t(key);
  return note;
}
