import type { CategoryRollup, CategoryRollupGroup, TopSpendingItem } from "@treasury-ops/shared";

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

/** One top-spending item per root category, with its descendants' spend beneath it. */
export function toTopSpendingItem(group: CategoryRollupGroup): TopSpendingItem {
  const { root, descendants } = group;
  return {
    ...(root.categoryId === undefined ? {} : { categoryId: root.categoryId }),
    name: root.name,
    ...(root.icon === undefined ? {} : { icon: root.icon }),
    ...(root.color === undefined ? {} : { color: root.color }),
    isArchived: root.isArchived,
    amountMinor: root.totalSpentMinor,
    directAmountMinor: root.directSpentMinor,
    txnCount: root.totalTxnCount,
    children: descendants.filter((node) => node.totalSpentMinor > 0)
  };
}
