import type { CategoryRollupNode } from "@treasury-ops/shared";

import { glyphFor } from "@/features/categories";

const UNRESOLVED_COLOR = "#71817a";

export type RollupCategoryMeta = Readonly<{ name: string; icon: string; color: string }>;

export function rollupCategoryMeta(node: CategoryRollupNode): RollupCategoryMeta {
  if (node.categoryId === undefined) {
    return { name: node.name, icon: "∅", color: UNRESOLVED_COLOR };
  }
  return {
    name: node.name,
    icon: glyphFor(node),
    color: node.color ?? UNRESOLVED_COLOR
  };
}

/**
 * Only top-level categories: a descendant's spend is already inside its root's
 * total, so these rows are the ones that add up to the month's spend.
 */
export function rootsWithSpend(nodes: readonly CategoryRollupNode[]): CategoryRollupNode[] {
  return nodes.filter((node) => node.depth === 0 && node.totalSpentMinor > 0);
}
