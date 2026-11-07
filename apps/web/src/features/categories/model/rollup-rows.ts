import type { CategoryRollupNode } from "@treasury-ops/shared";

export type RollupRow = Readonly<{
  key: string;
  name: string;
  depth: number;
  amountMinor: number;
  isArchived: boolean;
  /** The money booked on the parent itself rather than on any subcategory. */
  isDirect: boolean;
}>;

/**
 * The rows to show beneath a root so they visibly add up to its total: every
 * descendant with spend, plus a "direct" row wherever a category with visible
 * subcategories also has spend of its own.
 */
export function rollupRowsBeneath(
  root: CategoryRollupNode,
  descendants: readonly CategoryRollupNode[]
): RollupRow[] {
  const visible = descendants.filter((node) => node.totalSpentMinor > 0);
  const rows: RollupRow[] = [];
  const addDirectRow = (node: CategoryRollupNode): void => {
    const hasVisibleChild = visible.some((other) => other.parentCategoryId === node.categoryId);
    if (node.directSpentMinor === 0 || !hasVisibleChild) return;
    rows.push({
      key: `${node.categoryId ?? "uncategorized"}:direct`,
      name: `${node.name} (direct)`,
      depth: node.depth + 1,
      amountMinor: node.directSpentMinor,
      isArchived: false,
      isDirect: true
    });
  };

  addDirectRow(root);
  for (const node of visible) {
    rows.push({
      key: node.categoryId ?? "uncategorized",
      name: node.name,
      depth: node.depth,
      amountMinor: node.totalSpentMinor,
      isArchived: node.isArchived,
      isDirect: false
    });
    addDirectRow(node);
  }
  return rows;
}
