import { expect, test } from "@playwright/test";

test.describe("cash-flow forecast — unauthenticated access", () => {
  test("redirects to login while preserving the selected horizon", async ({ page }) => {
    await page.goto("/cash-flow?days=60");
    await expect(page).toHaveURL(/\/login\?next=%2Fcash-flow%3Fdays%3D60$/);
  });
});
