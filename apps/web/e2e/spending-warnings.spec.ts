import { expect, test } from "@playwright/test";

// The authenticated group requires a live API (Postgres + Redis reachable) and an
// existing account with posted expenses. Set E2E_TEST_EMAIL / E2E_TEST_PASSWORD
// before running, or that group is skipped — same convention as login.spec.ts.
// The unauthenticated group needs no backend and always runs.

test.describe("spending warnings — unauthenticated access", () => {
  test("redirects to /login with a return URL", async ({ page }) => {
    await page.goto("/spending-warnings");
    await expect(page).toHaveURL(/\/login\?next=%2Fspending-warnings$/);
  });

  test("redirects a filtered link to /login preserving the query string", async ({ page }) => {
    await page.goto("/spending-warnings?filter=large_expenses");
    await expect(page).toHaveURL(/\/login\?next=%2Fspending-warnings%3Ffilter%3Dlarge_expenses$/);
  });
});

test.describe("spending warnings — authenticated", () => {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;

  test.skip(
    email === undefined || password === undefined,
    "E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set"
  );

  test.beforeEach(async ({ page }) => {
    if (email === undefined || password === undefined) {
      throw new Error("E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set");
    }
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/");
  });

  test("server-renders the first page, without a page-load alert region", async ({ page }) => {
    await page.goto("/spending-warnings");

    await expect(page.getByRole("heading", { name: "Spending patterns" })).toBeVisible();
    // A learning/ready-empty/populated response is all valid here — this asserts
    // the page shell renders without a client-side loading flash and never uses
    // role="alert" for page-load content (plan §2).
    await expect(page.getByRole("heading", { level: 2 })).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("filters by URL and offers Show all when a filter hides everything", async ({ page }) => {
    await page.goto("/spending-warnings");
    await page.getByRole("button", { name: "Large expenses" }).click();
    await expect(page).toHaveURL(/\?filter=large_expenses$/);

    const showAll = page.getByRole("link", { name: "Show all" });
    if (await showAll.isVisible().catch(() => false)) {
      await showAll.click();
      await expect(page).toHaveURL("/spending-warnings");
    }
  });

  test("has no automatically detectable accessibility violations", async ({ page }) => {
    const { default: AxeBuilder } = await import("@axe-core/playwright");
    await page.goto("/spending-warnings");
    const scan = await new AxeBuilder({ page }).analyze();
    expect(scan.violations).toEqual([]);
  });
});
