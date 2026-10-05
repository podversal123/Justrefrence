/**
 * Sensitive-field masking — applied at the serialization boundary, never at
 * rest (data is stored in full/encrypted; these functions only shape what a
 * list/read response is allowed to show). See docs/security.md §6-7:
 * "PAN: ABCDE****F", "Bank: ******1234". No I/O, unit-tested directly.
 */

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const visible = local.slice(0, 1);
  return `${visible}${"*".repeat(Math.max(local.length - 1, 3))}@${domain}`;
}

/** Keeps the last 4 digits only, e.g. "+919876543210" -> "******3210". */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return "*".repeat(digits.length);
  const last4 = digits.slice(-4);
  return `${"*".repeat(digits.length - 4)}${last4}`;
}

/** "ABCDE1234F" -> "ABCDE****F" (first 5 + last 1 visible, per security.md). */
export function maskPan(pan: string): string {
  if (pan.length <= 6) return "*".repeat(pan.length);
  return `${pan.slice(0, 5)}${"*".repeat(pan.length - 6)}${pan.slice(-1)}`;
}

/** "1234567890" -> "******7890" (last 4 visible). */
export function maskBankAccountNumber(accountNo: string): string {
  const digits = accountNo.replace(/\s/g, "");
  if (digits.length <= 4) return "*".repeat(digits.length);
  return `${"*".repeat(digits.length - 4)}${digits.slice(-4)}`;
}

/** Masks whichever destination type a given OTP channel implies. */
export function maskDestination(destination: string, channel: "EMAIL" | "SMS" | "WHATSAPP"): string {
  return channel === "EMAIL" ? maskEmail(destination) : maskPhone(destination);
}
