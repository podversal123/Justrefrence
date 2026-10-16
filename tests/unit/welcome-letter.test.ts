import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { renderWelcomeLetter } = await import("@/server/lib/welcome-letter-pdf");

const member = {
  memberName: "Demo Member",
  membershipNumber: "2815618218",
  email: "m@example.com",
  mobile: null,
  supportEmail: null,
};

// The text is read back out of the real PDF with pdftotext, so the test only runs where it is installed.
const hasPdftotext = spawnSync("pdftotext", ["-v"]).error === undefined;

function textOf(pdf: Buffer): string {
  const file = join(mkdtempSync(join(tmpdir(), "letter-")), "letter.pdf");
  writeFileSync(file, pdf);
  return execFileSync("pdftotext", ["-layout", file, "-"]).toString();
}

describe("welcome letter", () => {
  it.skipIf(!hasPdftotext)("prints the Referral ID when someone referred the member", async () => {
    const text = textOf(await renderWelcomeLetter({ ...member, referralId: "7543439413" }));
    expect(text).toContain("Membership No.: 2815618218");
    expect(text).toContain("Referral ID No.: 7543439413");
  });

  it.skipIf(!hasPdftotext)(
    "leaves the Referral ID out when nobody referred the member",
    async () => {
      const text = textOf(await renderWelcomeLetter({ ...member, referralId: null }));
      expect(text).toContain("Membership No.: 2815618218");
      expect(text).not.toContain("Referral ID");
    },
  );
});
