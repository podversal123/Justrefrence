import { test, expect } from "@playwright/test";

/**
 * Journeys that need no demo data and no real account, so they keep working on an empty production
 * database: the public Careers page, the sign-in screen (email or Member ID), what a signed-out visitor
 * is sent to, and the phone layout. Signed-in journeys (two-step, orders, referrals) need real accounts
 * and are covered by the integration tests and the manual role-by-role checks instead.
 */

test.describe("careers page", () => {
  test("shows every section of the client's wording and the way to apply", async ({ page }) => {
    await page.goto("/careers");
    for (const heading of [
      "What You Do",
      "Way to Work",
      "What We Do",
      "Why Justreference?",
      "Current Openings",
      "Applying to Justreference",
    ]) {
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    }
    await expect(page.locator("ol").getByText("Business Development Manager")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Submit Your Résumé" })).toBeVisible();
    await expect(page.locator('a[href^="mailto:info@justreference.in"]')).toBeVisible();
  });

  test("has a résumé form with the listed positions and a file field", async ({ page }) => {
    await page.goto("/careers");
    await expect(page.getByLabel("Full name")).toBeVisible();
    await expect(page.getByLabel("Your résumé")).toBeVisible();
    // The choose option plus the four openings plus the general application.
    await expect(page.locator("#rs-position option")).toHaveCount(6);
    await expect(page.getByRole("button", { name: "Send my résumé" })).toBeVisible();
    // The bot trap is there, but far off screen and hidden from assistive technology.
    const box = await page.locator("#rs-website").boundingBox();
    expect(box?.x ?? 0).toBeLessThan(-1000);
    await expect(page.locator('[aria-hidden="true"] #rs-website')).toHaveCount(1);
  });

  test("is linked from the footer", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('footer a[href="/careers"]')).toHaveCount(1);
  });

  test("has no horizontal overflow on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/careers");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });
});

test.describe("sign in with email or Member ID", () => {
  test("asks for an email or Member ID and a password", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("Email or Member ID")).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  });

  test("refuses an ID that is not 10 digits, before asking the server", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email or Member ID").fill("281561821");
    await page.getByLabel("Password", { exact: true }).fill("anything-at-all");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("form [role=alert]")).toContainText(/email or 10-digit Member ID/i);
    await expect(page).toHaveURL(/\/login/);
  });

  test("gives the same message for an unknown Member ID as for a wrong password", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Email or Member ID").fill("1000000000");
    await page.getByLabel("Password", { exact: true }).fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("form [role=alert]")).toContainText(
      "Incorrect email, Member ID or password.",
    );
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("signed-out visitors", () => {
  for (const path of [
    "/two-step",
    "/my-projects",
    "/sale-purchase",
    "/referrals",
    "/admin/legal",
  ]) {
    test(`${path} sends a signed-out visitor to sign in`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    });
  }
});
