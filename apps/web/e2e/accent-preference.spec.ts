import { expect, test } from "@playwright/test";

const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;

test.describe("accent preference", () => {
  test.skip(
    email === undefined || password === undefined,
    "E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set"
  );

  test("selects, persists, customizes, and restores the default accent", async ({ page }) => {
    if (email === undefined || password === undefined) {
      throw new Error("E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set");
    }

    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/");

    await page.goto("/settings?tab=appearance");
    await page.getByRole("button", { name: /Ocean blue/ }).click();
    await expect(page.getByRole("button", { name: "Apply color" })).toBeEnabled();
    await page.getByRole("button", { name: "Apply color" }).click();
    await expect(page.getByRole("button", { name: "Applied" })).toBeDisabled();
    await expect(page.locator("html")).toHaveAttribute("data-accent", "ocean");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-accent", "ocean");

    await page.getByLabel("Hex, RGB, or HSL").fill("rgb(255, 0, 0)");
    await expect(page.getByRole("button", { name: "Apply color" })).toBeEnabled();
    await page.getByRole("button", { name: "Apply color" }).click();
    await expect(page.getByRole("button", { name: "Applied" })).toBeDisabled();
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
    await expect(page.getByRole("button", { name: "Applied" })).toBeDisabled();

    await page.getByRole("button", { name: "Dark", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("html")).toHaveAttribute("data-accent", "custom");

    await page.getByRole("button", { name: "System", exact: true }).click();
    await expect.poll(() => page.locator("html").getAttribute("data-theme")).toBeNull();
    await expect(page.locator("html")).toHaveAttribute("data-accent", "custom");

    await page.getByRole("button", { name: "Reset to TreasuryOps default" }).click();
    await expect.poll(() => page.locator("html").getAttribute("data-accent")).toBeNull();
    await expect
      .poll(() =>
        page
          .locator("html")
          .evaluate((element) => element.style.getPropertyValue("--accent-choice-light"))
      )
      .toBe("");
    await expect(page.getByRole("button", { name: /TreasuryOps green/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(page.getByRole("button", { name: "Applied" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Reset to TreasuryOps default" })).toBeDisabled();
  });
});
