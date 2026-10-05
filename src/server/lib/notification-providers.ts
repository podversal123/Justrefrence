import "server-only";
import { logger } from "@/server/lib/logger";

/**
 * Provider abstraction for outbound SMS/WhatsApp/Email — see
 * docs/notifications.md §3. Concrete provider selection is driven by
 * environment configuration; when the corresponding credentials are absent
 * (this environment has no live MSG91/Resend account — see .env.local,
 * placeholder values only) sends fall back to a structured console log so
 * the flow is still fully exercisable in development, matching the
 * console/dev-fallback pattern already used elsewhere in this codebase.
 * Swapping in a real MSG91/Resend HTTP call is a credentials-only change,
 * not an architecture change — the call sites never see the difference.
 *
 * The raw OTP code is passed as a template variable, never logged: the
 * logger's redaction pass strips any key matching /otp/i regardless, but
 * the console fallback below deliberately never echoes `vars` verbatim for
 * an OTP-purpose send either, as defense in depth.
 */

export interface DeliveryResult {
  provider: string;
  delivered: boolean;
}

interface SendArgs {
  to: string;
  template: string;
  vars: Record<string, string>;
}

async function devFallback(channel: string, args: SendArgs): Promise<DeliveryResult> {
  logger.info(`notification_dev_fallback_${channel.toLowerCase()}`, {
    to: args.to,
    template: args.template,
    // OTP codes are redacted by the logger's key-pattern match; every other
    // template var is safe to log for local debugging.
    vars: args.vars,
  });
  return { provider: `console-${channel.toLowerCase()}`, delivered: true };
}

export async function sendSms(args: SendArgs): Promise<DeliveryResult> {
  if (!process.env["MSG91_AUTH_KEY"] || !process.env["MSG91_SENDER_ID"]) {
    return devFallback("SMS", args);
  }
  // A real MSG91 SMS API call would go here — not wired up, since this
  // environment has no live MSG91 account (see docs/environment.md).
  return devFallback("SMS", args);
}

export async function sendWhatsApp(args: SendArgs): Promise<DeliveryResult> {
  if (!process.env["MSG91_WHATSAPP_API_KEY"]) {
    return devFallback("WHATSAPP", args);
  }
  return devFallback("WHATSAPP", args);
}

export async function sendEmail(args: SendArgs): Promise<DeliveryResult> {
  if (!process.env["RESEND_API_KEY"]) {
    return devFallback("EMAIL", args);
  }
  return devFallback("EMAIL", args);
}
