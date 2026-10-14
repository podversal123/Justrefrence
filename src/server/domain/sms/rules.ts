/**
 * SMS rules — pure, no I/O, unit-tested directly (tests/unit/sms-rules.test.ts).
 * How long a text is, how many parts the phone will bill it as, and what to tell a person about
 * a message's state without claiming more than we know.
 */

export type SmsStatus = "QUEUED" | "SENT" | "FAILED";
export type SmsAudience = "SINGLE" | "ALL_MEMBERS" | "VENDORS";

/** A technical safety limit, not a business value: one send never goes to more people than this. */
export const MAX_BULK_RECIPIENTS = 500;
/** Longer texts are split into several billed parts; this keeps a single message sensible. */
export const MAX_SMS_PARTS = 3;

// The GSM 03.38 basic character set. Text made only of these costs 160 characters per part.
const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
// Each of these counts as two characters.
const GSM_EXTENDED = "^{}\[~]|€\f";

export interface SmsLength {
  /** Characters the phone counts (extended GSM characters count twice). */
  length: number;
  /** True when the text needs Unicode (Hindi, emoji, ...), which fits far fewer characters per part. */
  unicode: boolean;
  parts: number;
}

export function smsLength(body: string): SmsLength {
  const chars = Array.from(body);
  const unicode = chars.some((c) => !GSM_BASIC.includes(c) && !GSM_EXTENDED.includes(c));
  if (unicode) {
    const length = chars.length;
    return { length, unicode: true, parts: length <= 70 ? 1 : Math.ceil(length / 67) };
  }
  const length = chars.reduce((sum, c) => sum + (GSM_EXTENDED.includes(c) ? 2 : 1), 0);
  return { length, unicode: false, parts: length <= 160 ? 1 : Math.ceil(length / 153) };
}

export function checkSmsBody(body: string): { ok: boolean; message?: string } {
  const trimmed = body.trim();
  if (trimmed.length === 0) return { ok: false, message: "Write the message." };
  const { parts, unicode } = smsLength(trimmed);
  if (parts > MAX_SMS_PARTS) {
    return {
      ok: false,
      message: `The message is too long. Keep it within ${MAX_SMS_PARTS} SMS parts (${unicode ? "about 200" : "about 450"} characters).`,
    };
  }
  return { ok: true };
}

/** A provider whose name starts with "console" is the stand-in used when no real SMS service is connected. */
export function isRecordedOnly(provider: string | null): boolean {
  return provider === null || provider.startsWith("console");
}

/** What to show next to a message. Never says "delivered" unless a real provider took it. */
export function smsStateLabel(message: { status: SmsStatus; provider: string | null }): string {
  if (message.status === "FAILED") return "Failed";
  if (message.status === "QUEUED") return "Waiting to send";
  return isRecordedOnly(message.provider) ? "Recorded only (SMS service not connected)" : "Sent";
}

export const SMS_AUDIENCE_LABEL: Record<SmsAudience, string> = {
  SINGLE: "One member",
  ALL_MEMBERS: "All members",
  VENDORS: "All vendors",
};

/** A mobile number we can send to: digits with an optional leading +, 8 to 15 digits (E.164 length). */
export function isSendablePhone(phone: string | null | undefined): phone is string {
  return typeof phone === "string" && /^\+?\d{8,15}$/.test(phone.trim());
}
