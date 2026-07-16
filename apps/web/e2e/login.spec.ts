import { expect, test } from "@playwright/test";

// Requires a live API (MongoDB + Redis reachable) and an existing account.
// Set E2E_TEST_EMAIL / E2E_TEST_PASSWORD before running, or this suite is skipped.

const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;

test.describe("login", () => {
  test.skip(
    email === undefined || password === undefined,
    "E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set"
  );

  test("signs in and lands on the dashboard", async ({ page }) => {
    if (email === undefined || password === undefined) {
      throw new Error("E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set");
    }

    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: email })).toBeVisible();
  });
});
