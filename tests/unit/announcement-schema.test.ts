import { describe, expect, it } from "vitest";
import { announcementFieldsSchema } from "@/lib/schemas/announcement";

describe("announcementFieldsSchema", () => {
  const ok = { title: "Holiday notice", body: "We are closed on Diwali.", audience: "ALL" };

  it("accepts a normal notice", () => {
    expect(announcementFieldsSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects an unknown audience", () => {
    expect(announcementFieldsSchema.safeParse({ ...ok, audience: "EVERYONE" }).success).toBe(false);
  });

  it("explains short or long text in plain words", () => {
    const r = announcementFieldsSchema.safeParse({
      title: "Hi",
      body: "x".repeat(1001),
      audience: "ALL",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const messages = Object.values(r.error.flatten().fieldErrors).flat().join(" ");
      expect(messages).toMatch(/short title/);
      expect(messages).toMatch(/under 1000/);
    }
  });
});
