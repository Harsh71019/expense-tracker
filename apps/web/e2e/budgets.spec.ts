import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page): Promise<void> {
  await page.goto("/login?next=%2Fbudgets");
  await page.getByLabel("Email").fill("you@treasury-ops.mock");
  await page.getByLabel("Password", { exact: true }).fill("correct-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/budgets$/, { timeout: 15_000 });
}

test.describe("monthly budgets", () => {
  test.skip(
    process.env.NEXT_PUBLIC_MOCK_API !== "1",
    "Runs against the deterministic in-memory API."
  );

  test("creates, edits, archives, and restores an exact-category budget", async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole("heading", { name: "Monthly budgets", exact: true })).toBeVisible();
    await expect(page.getByText("No monthly budgets yet")).toBeVisible();

    await page.getByRole("button", { name: "Add your first budget" }).click();
    await page.getByRole("combobox", { name: "Expense category" }).selectOption({
      label: "Groceries"
    });
    await page.getByLabel("Monthly limit").fill("5000");
    await page.getByRole("button", { name: "Add budget", exact: true }).click();

    const card = page.locator("article").filter({ hasText: "Groceries" });
    await expect(card).toBeVisible();
    await expect(card.getByRole("meter")).toBeVisible();

    await card.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Monthly limit").fill("1000");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(card.getByText("₹1,000.00")).toBeVisible();

    await card.getByRole("button", { name: "Archive" }).click();
    await expect(page.getByText(/Transactions are not changed/)).toBeVisible();
    await page.getByRole("button", { name: "Archive budget" }).click();
    await expect(page.getByText("No monthly budgets yet")).toBeVisible();

    await page.getByRole("checkbox", { name: "Show inactive budgets" }).check();
    const inactiveCard = page.locator("article").filter({ hasText: "Groceries" });
    await expect(inactiveCard.getByText("Inactive")).toBeVisible();
    await inactiveCard.getByRole("button", { name: "Restore" }).click();
    await page.getByLabel("Monthly limit").fill("2500");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(inactiveCard.getByText("₹2,500.00")).toBeVisible();

    await page.waitForTimeout(400);
    const scan = await new AxeBuilder({ page }).include("main").analyze();
    expect(scan.violations).toEqual([]);
  });
});
