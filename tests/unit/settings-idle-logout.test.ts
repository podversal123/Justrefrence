import { describe, expect, it } from "vitest";
import { siteSettingsSchema } from "@/lib/schemas/settings";

const parse = (idleLogoutMinutes?: string) =>
  siteSettingsSchema.safeParse({ ...(idleLogoutMinutes === undefined ? {} : { idleLogoutMinutes }) });

describe("idle logout minutes setting", () => {
  it("falls back to the default when left empty", () => {
    expect(parse()).toMatchObject({ success: true, data: { idleLogoutMinutes: 30 } });
    expect(parse("")).toMatchObject({ success: true, data: { idleLogoutMinutes: 30 } });
  });

  it("accepts 0 to turn auto logout off", () => {
    expect(parse("0")).toMatchObject({ success: true, data: { idleLogoutMinutes: 0 } });
  });

  it("accepts values from 5 to 1440", () => {
    expect(parse("5")).toMatchObject({ success: true, data: { idleLogoutMinutes: 5 } });
    expect(parse("1440")).toMatchObject({ success: true, data: { idleLogoutMinutes: 1440 } });
  });

  it("rejects a value too short, too long, or not a whole number", () => {
    for (const bad of ["1", "4", "1441", "-5", "2.5", "abc"]) {
      expect(parse(bad).success, bad).toBe(false);
    }
  });
});
