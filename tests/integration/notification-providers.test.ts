import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The real SMS / email calls, with `fetch` replaced by a fake (no network, no keys). What matters:
 * nothing is sent while keys are missing or still the REPLACE_ME placeholder; a real send goes to the
 * right provider with the right shape; and a provider that refuses or is unreachable is reported as
 * not delivered rather than silently treated as sent.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { sendEmail, sendSms, sendWhatsApp, toMsg91Number, msg91TemplateEnvName } =
  await import("@/server/lib/notification-providers");

const fetchMock = vi.fn();
const KEYS = [
  "RESEND_API_KEY",
  "EMAIL_FROM_ADDRESS",
  "MSG91_AUTH_KEY",
  "MSG91_SENDER_ID",
  "MSG91_TEMPLATE_OTP_CODE",
] as const;

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  for (const key of KEYS) vi.stubEnv(key, "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const email = { to: "a@b.co", template: "otp_code", vars: { code: "482913", purpose: "LOGIN" } };
const sms = { to: "+919876543210", template: "otp_code", vars: { code: "482913" } };

describe("sendEmail", () => {
  it("only records the email while the key is missing or the placeholder", async () => {
    expect((await sendEmail(email)).provider).toBe("console-email");
    vi.stubEnv("RESEND_API_KEY", "REPLACE_ME");
    expect((await sendEmail(email)).provider).toBe("console-email");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the rendered email to Resend with the key and the configured sender", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM_ADDRESS", "no-reply@justreference.in");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "x" }), { status: 200 }));

    const result = await sendEmail(email);

    expect(result).toEqual({ provider: "resend", delivered: true });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.authorization).toBe("Bearer re_test");
    const body = JSON.parse(init.body);
    expect(body.from).toBe("Just Reference <no-reply@justreference.in>");
    expect(body.to).toEqual(["a@b.co"]);
    expect(body.text).toContain("482913");
  });

  it("reports not delivered when Resend refuses, and when it cannot be reached", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 422 }));
    expect((await sendEmail(email)).delivered).toBe(false);
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    expect((await sendEmail(email)).delivered).toBe(false);
  });
});

describe("sendSms", () => {
  it("only records the SMS unless the key, sender and this template's ID are all set", async () => {
    vi.stubEnv("MSG91_AUTH_KEY", "key");
    vi.stubEnv("MSG91_SENDER_ID", "JUSTRF");
    expect((await sendSms(sms)).provider).toBe("console-sms");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to MSG91's flow API with the template and the number as digits", async () => {
    vi.stubEnv("MSG91_AUTH_KEY", "key");
    vi.stubEnv("MSG91_SENDER_ID", "JUSTRF");
    vi.stubEnv("MSG91_TEMPLATE_OTP_CODE", "tmpl123");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ type: "success" }), { status: 200 }));

    const result = await sendSms(sms);

    expect(result).toEqual({ provider: "msg91", delivered: true });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://control.msg91.com/api/v5/flow/");
    expect(init.headers.authkey).toBe("key");
    expect(JSON.parse(init.body)).toEqual({
      template_id: "tmpl123",
      sender: "JUSTRF",
      short_url: "0",
      recipients: [{ mobiles: "919876543210", code: "482913" }],
    });
  });

  it("does not call a message delivered unless MSG91 says success", async () => {
    vi.stubEnv("MSG91_AUTH_KEY", "key");
    vi.stubEnv("MSG91_SENDER_ID", "JUSTRF");
    vi.stubEnv("MSG91_TEMPLATE_OTP_CODE", "tmpl123");
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ type: "error" }), { status: 200 }),
    );
    expect((await sendSms(sms)).delivered).toBe(false);
    fetchMock.mockResolvedValueOnce(new Response("not json", { status: 500 }));
    expect((await sendSms(sms)).delivered).toBe(false);
    fetchMock.mockRejectedValueOnce(new Error("timeout"));
    expect((await sendSms(sms)).delivered).toBe(false);
  });
});

describe("helpers and WhatsApp", () => {
  it("turns a phone number into digits only and names the template variable", () => {
    expect(toMsg91Number("+91 98765-43210")).toBe("919876543210");
    expect(msg91TemplateEnvName("otp_code")).toBe("MSG91_TEMPLATE_OTP_CODE");
  });

  it("keeps WhatsApp recorded only", async () => {
    expect((await sendWhatsApp(sms)).provider).toBe("console-whatsapp");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
