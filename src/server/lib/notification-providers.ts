import "server-only";
import { logger } from "@/server/lib/logger";
import { renderEmail } from "@/server/lib/email-templates";

/**
 * Provider abstraction for outbound SMS/WhatsApp/Email — see
 * docs/notifications.md §3. Concrete provider selection is driven by
 * environment configuration; when the corresponding credentials are absent
 * or still the `REPLACE_ME` placeholder, sends fall back to a structured
 * console log so the flow is still fully exercisable in development. The
 * call sites never see the difference, except that the fallback reports a
 * provider name starting with "console" (which the SMS pages show as
 * "recorded only", never as sent).
 *
 * - Email goes out through Resend (https://resend.com/docs/api-reference/emails/send-email).
 * - SMS goes out through MSG91's Flow API, using one DLT-approved template per message kind. The
 *   template IDs come from the environment (MSG91_TEMPLATE_<NAME>), because they belong to the
 *   client's MSG91 account. A kind with no template ID configured is recorded only, never sent.
 * - WhatsApp is still recorded only: MSG91's WhatsApp API needs an approved Meta template and an
 *   integrated number, which do not exist yet (docs/business-rules.md Q-43).
 *
 * A real send that the provider refuses returns `delivered: false` (and logs why, without the
 * message text); the callers already treat that as a failed send. The raw OTP code is passed as a
 * template variable, never logged: the logger's redaction pass strips any key matching /otp/i, and
 * the console fallback never echoes `vars` for an OTP send either, as defense in depth.
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

const REQUEST_TIMEOUT_MS = 10_000;

/** A configured value, or `undefined` when it is missing or still the placeholder. */
function configured(name: string): string | undefined {
  const value = process.env[name];
  return value && value !== "REPLACE_ME" ? value : undefined;
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

/** `+91 98765-43210` -> `919876543210`: MSG91 wants the digits with the country code and no plus. */
export function toMsg91Number(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** `otp_code` -> `MSG91_TEMPLATE_OTP_CODE`. */
export function msg91TemplateEnvName(template: string): string {
  return `MSG91_TEMPLATE_${template.toUpperCase()}`;
}

export async function sendSms(args: SendArgs): Promise<DeliveryResult> {
  const authKey = configured("MSG91_AUTH_KEY");
  const senderId = configured("MSG91_SENDER_ID");
  const templateId = configured(msg91TemplateEnvName(args.template));
  if (!authKey || !senderId || !templateId) return devFallback("SMS", args);

  try {
    const response = await fetch("https://control.msg91.com/api/v5/flow/", {
      method: "POST",
      headers: { authkey: authKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        template_id: templateId,
        sender: senderId,
        short_url: "0",
        recipients: [{ mobiles: toMsg91Number(args.to), ...args.vars }],
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const result = (await response.json().catch(() => null)) as { type?: string } | null;
    const accepted = response.ok && result?.type === "success";
    if (!accepted) {
      logger.error("sms_provider_rejected", {
        provider: "msg91",
        template: args.template,
        status: response.status,
        type: result?.type ?? null,
      });
    }
    return { provider: "msg91", delivered: accepted };
  } catch (error) {
    logger.error("sms_provider_unreachable", {
      provider: "msg91",
      template: args.template,
      message: error instanceof Error ? error.message : String(error),
    });
    return { provider: "msg91", delivered: false };
  }
}

export async function sendWhatsApp(args: SendArgs): Promise<DeliveryResult> {
  return devFallback("WHATSAPP", args);
}

export async function sendEmail(args: SendArgs): Promise<DeliveryResult> {
  const apiKey = configured("RESEND_API_KEY");
  if (!apiKey) return devFallback("EMAIL", args);

  const email = renderEmail(args.template, args.vars);
  const from = configured("EMAIL_FROM_ADDRESS") ?? "no-reply@justreference.in";
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: `Just Reference <${from}>`,
        to: [args.to],
        subject: email.subject,
        text: email.text,
        html: email.html,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      logger.error("email_provider_rejected", {
        provider: "resend",
        template: args.template,
        status: response.status,
      });
    }
    return { provider: "resend", delivered: response.ok };
  } catch (error) {
    logger.error("email_provider_unreachable", {
      provider: "resend",
      template: args.template,
      message: error instanceof Error ? error.message : String(error),
    });
    return { provider: "resend", delivered: false };
  }
}
