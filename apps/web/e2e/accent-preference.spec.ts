import { expect, test } from "@playwright/test";

const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;

test.describe("accent preference", () => {
  test.skip(
    email === undefined || password === undefined,
    "E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set"
  );

  test("selects, persists, customizes, and resets the accent", async ({ page }) => {
    if (email === undefined || password === undefined) {
      throw new Error("E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set");
    }

    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/");

    await page.goto("/more");
    await page.getByRole("button", { name: /Ocean blue/ }).click();
    await expect(page.locator("html")).toHaveAttribute("data-accent", "ocean");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-accent", "ocean");

    await page.getByLabel("Hex, RGB, or HSL").fill("rgb(255, 0, 0)");
    await page.getByRole("button", { name: "Apply custom color" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-accent", "custom");
    await expect
      .poll(() =>
        page
          .locator("html")
          .evaluate((element) => element.style.getPropertyValue("--accent-choice-light"))
      )
      .toBe("#ff0000");

    await page.reload();
    await expect(page.getByLabel("Hex, RGB, or HSL")).toHaveValue("#ff0000");

    await page.getByRole("button", { name: "Reset to Vyaya default" }).click();
    await expect.poll(() => page.locator("html").getAttribute("data-accent")).toBeNull();
  });
});
