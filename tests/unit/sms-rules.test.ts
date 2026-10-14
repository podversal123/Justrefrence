import { describe, expect, it } from "vitest";
import {
  MAX_SMS_PARTS,
  checkSmsBody,
  isRecordedOnly,
  isSendablePhone,
  smsLength,
  smsStateLabel,
} from "@/server/domain/sms/rules";

describe("smsLength", () => {
  it("counts plain text as 160 characters per part", () => {
    expect(smsLength("Hello")).toEqual({ length: 5, unicode: false, parts: 1 });
    expect(smsLength("a".repeat(160)).parts).toBe(1);
    expect(smsLength("a".repeat(161)).parts).toBe(2);
    expect(smsLength("a".repeat(306)).parts).toBe(2);
    expect(smsLength("a".repeat(307)).parts).toBe(3);
  });
  it("counts special GSM characters twice", () => {
    expect(smsLength("{}").length).toBe(4);
    expect(smsLength("€").length).toBe(2);
    expect(smsLength("a".repeat(159) + "€").parts).toBe(2);
  });
  it("switches to the smaller Unicode limit for Hindi and emoji", () => {
    const hindi = smsLength("नमस्ते");
    expect(hindi.unicode).toBe(true);
    expect(hindi.parts).toBe(1);
    expect(smsLength("अ".repeat(70)).parts).toBe(1);
    expect(smsLength("अ".repeat(71)).parts).toBe(2);
    expect(smsLength("अ".repeat(134)).parts).toBe(2);
    expect(smsLength("अ".repeat(135)).parts).toBe(3);
    expect(smsLength("Hi 😀").unicode).toBe(true);
  });
  it("counts an emoji as one character, not two", () => {
    expect(smsLength("😀").length).toBe(1);
  });
});

describe("checkSmsBody", () => {
  it("refuses an empty message", () => {
    expect(checkSmsBody("   ").ok).toBe(false);
  });
  it("accepts a normal message and refuses one beyond the part limit", () => {
    expect(checkSmsBody("Your reward is ready.").ok).toBe(true);
    expect(checkSmsBody("a".repeat(153 * MAX_SMS_PARTS)).ok).toBe(true);
    expect(checkSmsBody("a".repeat(153 * MAX_SMS_PARTS + 20)).ok).toBe(false);
    expect(checkSmsBody("अ".repeat(67 * MAX_SMS_PARTS + 5)).ok).toBe(false);
  });
});

describe("state labels", () => {
  it("never claims delivery when no real provider is connected", () => {
    expect(isRecordedOnly("console-sms")).toBe(true);
    expect(isRecordedOnly(null)).toBe(true);
    expect(isRecordedOnly("msg91")).toBe(false);
    expect(smsStateLabel({ status: "SENT", provider: "console-sms" })).toBe(
      "Recorded only (SMS service not connected)",
    );
    expect(smsStateLabel({ status: "SENT", provider: "msg91" })).toBe("Sent");
  });
  it("labels failed and waiting messages", () => {
    expect(smsStateLabel({ status: "FAILED", provider: "msg91" })).toBe("Failed");
    expect(smsStateLabel({ status: "QUEUED", provider: null })).toBe("Waiting to send");
  });
});

describe("isSendablePhone", () => {
  it("accepts an international or plain number and refuses junk", () => {
    expect(isSendablePhone("+919876543210")).toBe(true);
    expect(isSendablePhone("9876543210")).toBe(true);
    expect(isSendablePhone("12345")).toBe(false);
    expect(isSendablePhone("98765 43210")).toBe(false);
    expect(isSendablePhone("")).toBe(false);
    expect(isSendablePhone(null)).toBe(false);
  });
});
