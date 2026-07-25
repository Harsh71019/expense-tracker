import { expect, test, type Page } from "@playwright/test";

async function openFromSettings(page: Page, destination: "Goals" | "Transfers"): Promise<void> {
  await page.locator('a[href="/settings"]:visible').first().click();
  await page.getByRole("main").getByRole("link", { name: destination }).click();
}

test.describe("goal tracking", () => {
  test.skip(
    process.env.NEXT_PUBLIC_MOCK_API !== "1",
    "Runs against the deterministic in-memory API."
  );

  test("updates linked and tagged progress through real UI mutations", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/goals");
    await expect(page.getByRole("heading", { name: "Goals" })).toBeVisible();

    await page.getByRole("button", { name: "New goal" }).click();
    await page.getByLabel("Goal name").fill("Trip fund");
    await page.getByLabel("Target amount").fill("1000");
    await page.getByLabel("Target amount").blur();
    await page.getByLabel("Linked account").selectOption({ label: "SBI Savings" });
    await page.getByRole("button", { name: "Create goal" }).click();
    await expect(page.getByRole("link", { name: "Trip fund" })).toBeVisible();

    await openFromSettings(page, "Transfers");
    await page.getByRole("button", { name: "New transfer" }).click();
    await page.getByLabel("From account", { exact: true }).selectOption({ label: "HDFC Bank" });
    await page.getByLabel("To account", { exact: true }).selectOption({ label: "SBI Savings" });
    await page.getByLabel("Amount", { exact: true }).fill("500");
    await page.getByLabel("Amount", { exact: true }).blur();
    await page.getByLabel("Description", { exact: true }).fill("Fund the trip");
    await page.getByRole("button", { name: "Post transfer" }).click();

    await openFromSettings(page, "Goals");
    const linkedCard = page.locator("article").filter({ hasText: "Trip fund" });
    await expect(linkedCard.getByRole("img", { name: "50% funded" })).toBeVisible();

    await page.getByRole("button", { name: "New goal" }).click();
    await page.getByLabel("Goal name").fill("Laptop fund");
    await page.getByLabel("Target amount").fill("1000");
    await page.getByLabel("Target amount").blur();
    await page.getByRole("button", { name: "Transaction tag" }).click();
    await page.getByLabel("Transaction tag").fill("goal:e2e-laptop");
    await page.getByRole("button", { name: "Create goal" }).click();

    await page
      .locator('a[href="/add"]')
      .dispatchEvent("click", { bubbles: true, cancelable: true });
    await page.getByRole("button", { name: "Income" }).click();
    await page.getByLabel("Amount").fill("1000");
    await page.getByLabel("Amount").blur();
    await page.getByLabel("Account").selectOption({ label: "HDFC Bank" });
    await page.getByLabel("Category").selectOption({ label: "Salary" });
    await page.getByLabel("What was it?").fill("Laptop contribution");
    await page.getByLabel("Tags (optional, comma separated)").fill("goal:e2e-laptop");
    const postTransaction = page.waitForResponse(
      (response) =>
        response.url().includes("/v1/transactions") && response.request().method() === "POST"
    );
    await page.getByRole("button", { name: "Add to ledger" }).click();
    const transactionResponse = await postTransaction;
    expect(transactionResponse.status()).toBe(201);

    await openFromSettings(page, "Goals");
    const taggedCard = page.locator("article").filter({ hasText: "Laptop fund" });
    await expect(taggedCard.getByRole("img", { name: "100% funded" })).toBeVisible();
    await expect(taggedCard.getByText("Achieved 🎉")).toBeVisible();
  });
});
