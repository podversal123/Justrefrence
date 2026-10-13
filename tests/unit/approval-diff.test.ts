import { describe, expect, it } from "vitest";
import {
  buildDiff,
  findConflicts,
  normalizeValue,
  pendingKey,
  proposedFromDiff,
} from "@/server/domain/approvals/diff";

const FIELDS = [
  { key: "fullName", label: "Full name" },
  { key: "pan", label: "PAN" },
  { key: "telephone", label: "Telephone" },
];

describe("buildDiff", () => {
  it("lists only the fields that changed, in declared order", () => {
    const diff = buildDiff(
      FIELDS,
      { fullName: "Asha Rao", pan: "ABCDE1234F", telephone: null },
      { telephone: "011-23456789", fullName: "Asha R Rao", pan: "ABCDE1234F" },
    );
    expect(diff).toEqual([
      { field: "fullName", label: "Full name", from: "Asha Rao", to: "Asha R Rao" },
      { field: "telephone", label: "Telephone", from: null, to: "011-23456789" },
    ]);
  });

  it("treats empty text and null as the same, and ignores stray spaces", () => {
    expect(buildDiff(FIELDS, { pan: null }, { pan: "" })).toEqual([]);
    expect(buildDiff(FIELDS, { fullName: "Asha" }, { fullName: "  Asha " })).toEqual([]);
  });

  it("records clearing a value as a change to empty", () => {
    expect(buildDiff(FIELDS, { pan: "ABCDE1234F" }, { pan: "" })).toEqual([
      { field: "pan", label: "PAN", from: "ABCDE1234F", to: null },
    ]);
  });

  it("ignores fields that are not part of the proposal or not declared", () => {
    expect(buildDiff(FIELDS, { fullName: "A", pan: "X" }, { fullName: "A" })).toEqual([]);
    expect(buildDiff(FIELDS, { fullName: "A" }, { fullName: "A", hidden: "x" })).toEqual([]);
  });
});

describe("helpers", () => {
  it("turns a diff back into the values to apply", () => {
    const diff = buildDiff(FIELDS, { fullName: "A", pan: "X" }, { fullName: "B", pan: "" });
    expect(proposedFromDiff(diff)).toEqual({ fullName: "B", pan: null });
  });

  it("builds a stable key per record, so a second pending request collides", () => {
    expect(pendingKey("VENDOR_PROFILE", "abc")).toBe("VENDOR_PROFILE:abc");
    expect(pendingKey("PRODUCT", "abc")).not.toBe(pendingKey("SERVICE", "abc"));
  });

  it("finds the fields someone changed after the request was made", () => {
    const diff = buildDiff(
      FIELDS,
      { fullName: "Asha Rao", pan: null },
      { fullName: "Asha R Rao", pan: "ABCDE1234F" },
    );
    expect(findConflicts(diff, { fullName: "Asha Rao", pan: null })).toEqual([]);
    expect(findConflicts(diff, { fullName: "Asha Rao", pan: "ZZZZZ9999Z" })).toEqual(["PAN"]);
    // Changes to fields the request does not touch never block it.
    expect(findConflicts(diff, { fullName: "Asha Rao", pan: null, telephone: "1" })).toEqual([]);
  });

  it("normalizes values", () => {
    expect(normalizeValue("  hi ")).toBe("hi");
    expect(normalizeValue("   ")).toBeNull();
    expect(normalizeValue(undefined)).toBeNull();
  });
});
