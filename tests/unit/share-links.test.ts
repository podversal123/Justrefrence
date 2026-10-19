import { describe, expect, it } from "vitest";
import { buildShareLinks } from "@/lib/share-links";

const message = {
  text: "Join Just Reference with my referral link: https://justreference.in/register?ref=2815618218",
  subject: "Join Just Reference",
};

describe("buildShareLinks", () => {
  it("puts the whole message, link included, in each address, encoded", () => {
    const links = buildShareLinks(message);
    const encoded = encodeURIComponent(message.text);
    expect(links.whatsapp).toBe(`https://wa.me/?text=${encoded}`);
    expect(links.sms).toContain(`body=${encoded}`);
    expect(links.email).toContain(`body=${encoded}`);
    expect(links.email).toContain("subject=Join%20Just%20Reference");
  });

  it("keeps the referral link's own ? and = from breaking the address", () => {
    const links = buildShareLinks(message);
    expect(links.whatsapp.split("?")).toHaveLength(2);
    expect(links.whatsapp).not.toContain("ref=2815618218&");
    expect(decodeURIComponent(links.whatsapp.split("text=")[1]!)).toBe(message.text);
  });

  it("encodes characters that could end the message early", () => {
    const links = buildShareLinks({ text: "a & b #1\nline two", subject: "x & y" });
    expect(links.whatsapp).toBe("https://wa.me/?text=a%20%26%20b%20%231%0Aline%20two");
    expect(links.email).toContain("subject=x%20%26%20y");
  });
});
