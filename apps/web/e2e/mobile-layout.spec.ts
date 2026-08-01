import { expect, test, type Page } from "@playwright/test";

const PROTECTED_ROUTES = [
  "/",
  "/transactions",
  "/add",
  "/reports",
  "/accounts",
  "/transfers",
  "/imports",
  "/bills",
  "/recurring",
  "/categories",
  "/category-rules",
  "/budgets",
  "/goals",
  "/assets",
  "/insights",
  "/spending-warnings",
  "/settings",
  "/settings/api-keys",
  "/export",
  "/more"
] as const;

async function signIn(page: Page): Promise<void> {
  await page.goto("/login?next=%2Fsettings");
  await page.getByLabel("Email").fill("you@treasury-ops.mock");
  await page.getByLabel("Password", { exact: true }).fill("correct-password");
  const signInButton = page.getByRole("button", { name: "Sign in" });
  await expect(signInButton).toBeEnabled();
  await signInButton.click();
  await expect(page).toHaveURL(/\/settings$/, { timeout: 15_000 });
}

test.describe("mobile route hardening", () => {
  test.skip(
    process.env.NEXT_PUBLIC_MOCK_API !== "1",
    "Runs against the deterministic in-memory API."
  );

  test("keeps every protected route inside the viewport", async ({ page, isMobile }) => {
    test.skip(!isMobile, "The dedicated mobile projects own this contract.");
    test.setTimeout(180_000);
    await signIn(page);

    for (const route of PROTECTED_ROUTES) {
      await page.goto(route);
      await expect(page.getByRole("main")).toBeVisible();
      await page.waitForTimeout(100);
      await expect
        .poll(
          async () => {
            try {
              return await page.evaluate(
                () => document.documentElement.scrollWidth - document.documentElement.clientWidth
              );
            } catch {
              return Number.POSITIVE_INFINITY;
            }
          },
          { message: `${route} should not scroll horizontally` }
        )
        .toBeLessThanOrEqual(0);
    }
  });

  test("keeps settings tabs and API-key actions touch sized", async ({ page, isMobile }) => {
    test.skip(!isMobile, "The dedicated mobile projects own this contract.");
    test.setTimeout(60_000);
    await signIn(page);

    const profileTab = page.getByRole("tab", { name: "Profile" });
    const profileBox = await profileTab.boundingBox();
    expect(profileBox?.height).toBeGreaterThanOrEqual(44);

    await page.goto("/settings/api-keys");
    const addTab = page.getByRole("tab", { name: "Add key" });
    const addBox = await addTab.boundingBox();
    expect(addBox?.height).toBeGreaterThanOrEqual(44);
  });
});
