import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function signIn(page: Page): Promise<void> {
  await page.goto("/login?next=%2Fadd");
  await expect(
    page.getByTitle("Requests are served by the in-memory mock API (NEXT_PUBLIC_MOCK_API=1)")
  ).toHaveText("Mock API");
  await page.getByLabel("Email").fill("you@treasury-ops.mock");
  await page.getByLabel("Password", { exact: true }).fill("correct-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/add$/, { timeout: 15_000 });
}

async function addIncome(page: Page, description: string): Promise<void> {
  await page.getByRole("button", { name: "Income" }).click();
  await page.getByLabel("Amount").fill("1000");
  await page.getByLabel("Amount").blur();
  await page.getByLabel("Account").selectOption({ label: "HDFC Bank" });
  await page.getByLabel("Category").selectOption({ label: "Salary" });
  await page.getByLabel("What was it?").fill(description);
  await page.getByRole("button", { name: "Add to ledger" }).click();
}

test.describe("frontend toast notifications", () => {
  test.skip(
    process.env.NEXT_PUBLIC_MOCK_API !== "1",
    "Runs against the deterministic in-memory API."
  );

  test("announces and dismisses successful operation feedback", async ({ page }) => {
    await signIn(page);
    await page.context().addCookies([
      {
        name: "treasury-ops-theme",
        value: "dark",
        url: new URL(page.url()).origin
      },
      {
        name: "treasury-ops-accent",
        value: "preset:violet",
        url: new URL(page.url()).origin
      }
    ]);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("html")).toHaveAttribute("data-accent", "violet");

    await addIncome(page, "Dark toast test contribution");

    const notifications = page.getByLabel("Application notifications");
    await expect(notifications.getByText("Transaction recorded in ledger")).toBeVisible();
    const operationToast = notifications
      .locator("[data-sonner-toast]")
      .filter({ hasText: "Transaction recorded in ledger" });
    const toaster = page.locator("[data-sonner-toaster]");
    await expect(toaster).toHaveAttribute("data-sonner-theme", "dark");
    await expect(toaster).toHaveAttribute("style", /--info-text: var\(--color-accent\)/);
    await expect
      .poll(() => operationToast.evaluate((element) => getComputedStyle(element).backgroundColor))
      .not.toBe("rgb(255, 255, 255)");
    await notifications.getByRole("button", { name: "Dismiss notification" }).click();
    await expect(notifications.getByText("Transaction recorded in ledger")).toBeHidden();
  });

  test("uses a light toast surface when the system theme is light", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await signIn(page);
    await addIncome(page, "Light toast test contribution");

    const notifications = page.getByLabel("Application notifications");
    await expect(notifications.getByText("Transaction recorded in ledger")).toBeVisible();
    const operationToast = notifications
      .locator("[data-sonner-toast]")
      .filter({ hasText: "Transaction recorded in ledger" });
    await expect(page.locator("[data-sonner-toaster]")).toHaveAttribute(
      "data-sonner-theme",
      "light"
    );
    await expect
      .poll(() => operationToast.evaluate((element) => getComputedStyle(element).backgroundColor))
      .not.toBe("rgb(0, 0, 0)");
  });
});
