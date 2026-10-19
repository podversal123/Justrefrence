import { describe, expect, it } from "vitest";
import { escapeHtml, renderEmail } from "@/server/lib/email-templates";

describe("renderEmail", () => {
  it("puts the code in both the text and the HTML of the OTP email", () => {
    const mail = renderEmail("otp_code", { code: "482913", purpose: "LOGIN" });
    expect(mail.subject).toMatch(/verification code/i);
    expect(mail.text).toContain("482913");
    expect(mail.html).toContain("482913");
    expect(mail.text).toMatch(/sign in/i);
  });

  it("words the OTP email for registration differently from login", () => {
    const mail = renderEmail("otp_code", { code: "111111", purpose: "REGISTRATION" });
    expect(mail.text).toMatch(/creating your account/i);
  });

  it("escapes HTML in names so a hostile name cannot inject markup", () => {
    const mail = renderEmail("welcome_letter", {
      fullName: '<img src=x onerror="alert(1)">',
      email: "a@b.co",
      memberId: "2815618218",
      referralCode: "2815618218",
    });
    expect(mail.html).not.toContain("<img");
    expect(mail.html).toContain("&lt;img");
    expect(mail.html).toContain("2815618218");
  });

  it("renders the birthday greeting with the member's name", () => {
    const mail = renderEmail("birthday_greeting", { fullName: "Anita" });
    expect(mail.text).toContain("Dear Anita");
  });

  it("refuses an unknown template or a missing value instead of sending a blank email", () => {
    expect(() => renderEmail("nope", {})).toThrow(/no email template/i);
    expect(() => renderEmail("otp_code", { purpose: "LOGIN" })).toThrow(/code/);
  });

  it("escapes all five special characters", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });
});
