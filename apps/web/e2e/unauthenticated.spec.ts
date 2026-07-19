import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// These specs only exercise the proxy's cookie-presence check (src/proxy.ts) and
// static page rendering — no backend API call is involved, so they run standalone.

test.describe("unauthenticated access", () => {
  test("redirects the dashboard to /login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login\?next=%2F$/);
  });

  test("redirects a nested protected route to /login with its full return URL", async ({
    page
  }) => {
    await page.goto("/transactions?account=cash&from=2026-07-01");
    await expect(page).toHaveURL(
      /\/login\?next=%2Ftransactions%3Faccount%3Dcash%26from%3D2026-07-01$/
    );
  });

  test("renders the sign-in form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("has no automatically detectable accessibility violations on sign-in", async ({ page }) => {
    await page.goto("/login");
    const scan = await new AxeBuilder({ page }).analyze();
    expect(scan.violations).toEqual([]);
  });
});
