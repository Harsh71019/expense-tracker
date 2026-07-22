import type { SeededCategories } from "./categories.js";
import type { SeedServices } from "./context.js";

/**
 * Feeds the import auto-suggest path (suggestCategory, category-rules/suggest-category.ts) —
 * matched case-insensitively against the fixture CSV's descriptions in seed/imports.ts, so a
 * seeded import batch actually exercises category suggestion end to end, not just a bare parse.
 */
export async function seedCategoryRules(
  services: SeedServices,
  userId: string,
  categories: SeededCategories
): Promise<void> {
  await Promise.all([
    services.categoryRules.create(userId, {
      pattern: "SWIGGY",
      categoryId: categories.diningOut.id
    }),
    services.categoryRules.create(userId, { pattern: "IRCTC", categoryId: categories.travel.id }),
    services.categoryRules.create(userId, {
      pattern: "AMAZON",
      categoryId: categories.shopping.id
    }),
    services.categoryRules.create(userId, { pattern: "UBER", categoryId: categories.transport.id })
  ]);
}
