import type { Category } from "@treasury-ops/shared";

import type { SeedServices } from "./context.js";

export type SeededCategories = Readonly<{
  foodAndDining: Category;
  groceries: Category;
  diningOut: Category;
  transport: Category;
  shopping: Category;
  utilities: Category;
  rent: Category;
  travel: Category;
  entertainment: Category;
  salary: Category;
  interest: Category;
  freelance: Category;
}>;

/**
 * Income + expense categories, a parent/child pair (Food & Dining ->
 * Groceries/Dining Out), icon/color set, and one archived category
 * (Entertainment) — SEEDING-PLAN.md §2. `entertainment` is returned so
 * callers can see it was archived, but it's never used as a transaction's
 * categoryId afterward (an archived category shouldn't gain new spend).
 */
export async function seedFullCategories(
  services: SeedServices,
  userId: string
): Promise<SeededCategories> {
  const foodAndDining = await services.categories.create(userId, {
    name: "Food & Dining",
    kind: "expense",
    icon: "utensils",
    color: "#f97316"
  });
  const [groceries, diningOut, transport, shopping, utilities, rent, travel, entertainment] =
    await Promise.all([
      services.categories.create(userId, {
        name: "Groceries",
        kind: "expense",
        parentId: foodAndDining.id,
        icon: "shopping-cart",
        color: "#fb923c"
      }),
      services.categories.create(userId, {
        name: "Dining Out",
        kind: "expense",
        parentId: foodAndDining.id,
        icon: "utensils-crossed",
        color: "#fdba74"
      }),
      services.categories.create(userId, {
        name: "Transport",
        kind: "expense",
        icon: "car",
        color: "#3b82f6"
      }),
      services.categories.create(userId, {
        name: "Shopping",
        kind: "expense",
        icon: "shopping-bag",
        color: "#ec4899"
      }),
      services.categories.create(userId, {
        name: "Utilities",
        kind: "expense",
        icon: "zap",
        color: "#eab308"
      }),
      services.categories.create(userId, {
        name: "Rent",
        kind: "expense",
        icon: "home",
        color: "#8b5cf6"
      }),
      services.categories.create(userId, {
        name: "Travel",
        kind: "expense",
        icon: "plane",
        color: "#06b6d4"
      }),
      services.categories.create(userId, {
        name: "Entertainment",
        kind: "expense",
        icon: "film",
        color: "#f43f5e"
      })
    ]);

  const [salary, interest, freelance] = await Promise.all([
    services.categories.create(userId, {
      name: "Salary",
      kind: "income",
      icon: "briefcase",
      color: "#22c55e"
    }),
    services.categories.create(userId, {
      name: "Interest",
      kind: "income",
      icon: "percent",
      color: "#14b8a6"
    }),
    services.categories.create(userId, {
      name: "Freelance",
      kind: "income",
      icon: "laptop",
      color: "#6366f1"
    })
  ]);

  await services.categories.archive(userId, entertainment.id);

  return {
    foodAndDining,
    groceries,
    diningOut,
    transport,
    shopping,
    utilities,
    rent,
    travel,
    entertainment,
    salary,
    interest,
    freelance
  };
}

/** Light dataset for the secondary user — flat, no hierarchy needed. */
export async function seedLightCategories(
  services: SeedServices,
  userId: string
): Promise<Readonly<{ groceries: Category; salary: Category }>> {
  const [groceries, salary] = await Promise.all([
    services.categories.create(userId, { name: "Groceries", kind: "expense" }),
    services.categories.create(userId, { name: "Salary", kind: "income" })
  ]);
  return { groceries, salary };
}
