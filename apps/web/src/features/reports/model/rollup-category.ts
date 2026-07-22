import type { Category } from "@treasury-ops/shared";

import { glyphFor } from "@/features/categories";

const UNRESOLVED_COLOR = "#71817a";

export type RollupCategoryMeta = Readonly<{ name: string; icon: string; color: string }>;

export function rollupCategoryMeta(
  categoryId: string | undefined,
  categories: readonly Category[]
): RollupCategoryMeta {
  if (categoryId === undefined) {
    return { name: "Uncategorized", icon: "∅", color: UNRESOLVED_COLOR };
  }
  const category = categories.find((item) => item.id === categoryId);
  if (category === undefined) {
    return { name: "Unavailable category", icon: "?", color: UNRESOLVED_COLOR };
  }
  return {
    name: category.name,
    icon: glyphFor(category),
    color: category.color ?? UNRESOLVED_COLOR
  };
}
