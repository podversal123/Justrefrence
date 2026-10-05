import { describe, expect, it } from "vitest";
import { toCsv } from "@/server/domain/dashboard/csv-export";

describe("toCsv", () => {
  it("formats a header row and data rows with CRLF line endings", () => {
    const csv = toCsv(["id", "amount"], [["1", "100"], ["2", "200"]]);
    expect(csv).toBe("id,amount\r\n1,100\r\n2,200");
  });

  it("quotes a field containing a comma", () => {
    const csv = toCsv(["name"], [["Acme, Inc."]]);
    expect(csv).toBe('name\r\n"Acme, Inc."');
  });

  it("quotes a field containing a newline", () => {
    const csv = toCsv(["notes"], [["line one\nline two"]]);
    expect(csv).toBe('notes\r\n"line one\nline two"');
  });

  it("doubles internal quotes", () => {
    const csv = toCsv(["label"], [['Say "hi"']]);
    expect(csv).toBe('label\r\n"Say ""hi"""');
  });

  it("renders null/undefined as an empty field", () => {
    const csv = toCsv(["a", "b"], [[null, undefined]]);
    expect(csv).toBe("a,b\r\n,");
  });

  it("handles no rows (header only)", () => {
    expect(toCsv(["a"], [])).toBe("a");
  });
});
