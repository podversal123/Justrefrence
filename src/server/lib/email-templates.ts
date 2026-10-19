/**
 * The wording of the emails the app sends, as pure functions (no I/O, no "server-only") so they can
 * be unit-tested. A template name plus its variables in, a subject and a text and HTML body out.
 * Every value that came from a person or the database is HTML-escaped before it goes into the HTML.
 */

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const SIGN_OFF = "Team Just Reference";

function wrap(paragraphs: string[], highlight?: string): { text: string; html: string } {
  const text = [...paragraphs, highlight ?? "", SIGN_OFF].filter(Boolean).join("\n\n");
  const body = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("");
  const big = highlight
    ? `<p style="font-size:24px;font-weight:bold;letter-spacing:4px">${escapeHtml(highlight)}</p>`
    : "";
  return {
    text,
    html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5">${body}${big}<p>${escapeHtml(SIGN_OFF)}</p></div>`,
  };
}

const OTP_PURPOSE_LINE: Record<string, string> = {
  REGISTRATION: "Use this code to verify your email and finish creating your account.",
  LOGIN: "Use this code to sign in.",
};

function need(vars: Record<string, string>, key: string): string {
  const value = vars[key];
  if (value === undefined) throw new Error(`Email template is missing the "${key}" value.`);
  return value;
}

export function renderEmail(template: string, vars: Record<string, string>): RenderedEmail {
  switch (template) {
    case "otp_code": {
      const code = need(vars, "code");
      const line = OTP_PURPOSE_LINE[vars["purpose"] ?? ""] ?? "Use this code to confirm it is you.";
      return {
        subject: "Your Just Reference verification code",
        ...wrap([line, "It works for a few minutes. Never share it with anyone."], code),
      };
    }
    case "welcome_letter": {
      const lines = [
        `Dear ${need(vars, "fullName")},`,
        "Welcome to Just Reference. Your account is ready.",
        `Member ID: ${need(vars, "memberId")}`,
        `Email: ${need(vars, "email")}`,
      ];
      return { subject: "Welcome to Just Reference", ...wrap(lines) };
    }
    case "birthday_greeting":
      return {
        subject: "Happy birthday from Just Reference!",
        ...wrap([
          `Dear ${need(vars, "fullName")},`,
          "Wishing you a very happy birthday from all of us at Just Reference.",
        ]),
      };
    default:
      throw new Error(`No email template named "${template}".`);
  }
}
