import type { Category, CategoryRollup, TopSpendingItem } from "@treasury-ops/shared";

const UNCATEGORIZED_KEY = "__uncategorized__";

/** Sums CategoryRollup entries (e.g. one per month) into one total per category. */
export function mergeCategoryRollups(rollups: readonly CategoryRollup[]): CategoryRollup[] {
  const merged = new Map<string, CategoryRollup>();
  for (const rollup of rollups) {
    const key = rollup.categoryId ?? UNCATEGORIZED_KEY;
    const existing = merged.get(key);
    merged.set(key, {
      ...(rollup.categoryId === undefined ? {} : { categoryId: rollup.categoryId }),
      spentMinor: (existing?.spentMinor ?? 0) + rollup.spentMinor,
      incomeMinor: (existing?.incomeMinor ?? 0) + rollup.incomeMinor,
      txnCount: (existing?.txnCount ?? 0) + rollup.txnCount
    });
  }
  return [...merged.values()];
}

/** Joins a spend total against category metadata for the top-spending panel. */
export function enrichCategoryTotal(
  rollup: CategoryRollup,
  categoriesById: ReadonlyMap<string, Category>
): TopSpendingItem {
  const category =
    rollup.categoryId === undefined ? undefined : categoriesById.get(rollup.categoryId);
  return {
    ...(rollup.categoryId === undefined ? {} : { categoryId: rollup.categoryId }),
    name: category?.name ?? "Uncategorized",
    ...(category?.icon === undefined ? {} : { icon: category.icon }),
    ...(category?.color === undefined ? {} : { color: category.color }),
    amountMinor: rollup.spentMinor,
    txnCount: rollup.txnCount
  };
}
