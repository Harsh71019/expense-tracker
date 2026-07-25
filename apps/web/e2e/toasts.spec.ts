import { expect, test } from "@playwright/test";

test.describe("frontend toast notifications", () => {
  test.skip(
    process.env.NEXT_PUBLIC_MOCK_API !== "1",
    "Runs against the deterministic in-memory API."
  );

  test("announces and dismisses successful operation feedback", async ({ page }) => {
    await page.goto("/add");
    await page.getByRole("button", { name: "Income" }).click();
    await page.getByLabel("Amount").fill("1000");
    await page.getByLabel("Amount").blur();
    await page.getByLabel("Account").selectOption({ label: "HDFC Bank" });
    await page.getByLabel("Category").selectOption({ label: "Salary" });
    await page.getByLabel("What was it?").fill("Toast test contribution");
    await page.getByRole("button", { name: "Add to ledger" }).click();

    const notifications = page.getByLabel("Application notifications");
    await expect(notifications.getByText("Transaction recorded in ledger")).toBeVisible();
    await notifications.getByRole("button", { name: "Dismiss notification" }).click();
    await expect(notifications.getByText("Transaction recorded in ledger")).toBeHidden();
  });

  test("announces successful sign-in across the authenticated redirect", async ({ page }) => {
    await page.goto("/login?next=%2Fadd");
    await page.getByLabel("Email").fill("you@treasury-ops.mock");
    await page.getByLabel("Password").fill("correct-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/add$/);
    await expect(
      page.getByLabel("Application notifications").getByText("Signed in successfully")
    ).toBeVisible();
  });
});
