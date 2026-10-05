import { test, expect } from "@playwright/test";

/**
 * Phase 1 smoke coverage: route protection, unauthorized page, error
 * surfaces, and basic responsiveness. Does NOT exercise a real login
 * (needs live Supabase credentials — see docs/environment.md) — that lands
 * once a real Supabase project is connected. Requires `npx playwright
 * install` for browser binaries before running.
 */

test.describe("route protection", () => {
  test("visiting /dashboard while signed out redirects to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("visiting /audit-log while signed out redirects to /login", async ({ page }) => {
    await page.goto("/audit-log");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("public pages render", () => {
  test("login page shows the form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("forgot-password page shows the form", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.getByRole("heading", { name: /forgot your password/i })).toBeVisible();
  });

  test("unauthorized page renders with a way back", async ({ page }) => {
    await page.goto("/unauthorized");
    await expect(page.getByRole("heading", { name: /don.t have access/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /back to dashboard/i })).toBeVisible();
  });

  test("unknown routes render the not-found page", async ({ page }) => {
    await page.goto("/this-route-does-not-exist");
    await expect(page.getByRole("heading", { name: /page not found/i })).toBeVisible();
  });
});

test.describe("responsive layout", () => {
  test("login form has no horizontal overflow at mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/login");
    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasOverflow).toBe(false);
  });
});
