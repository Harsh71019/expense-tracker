import { z } from "zod";

import { CategoryIdSchema } from "./category.js";
import { sumMinorAmounts } from "./money.js";

const NonNegativeMinorSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const CountSchema = z.number().int().min(0);

const UNCATEGORIZED_NAME = "Uncategorized";
const UNAVAILABLE_NAME = "Unavailable category";

/**
 * One row of a flattened, pre-ordered category breakdown: a node is followed
 * by all of its descendants, and `depth` says how far to indent it.
 *
 * `direct*` is what was booked on this category itself; `total*` adds every
 * descendant. Totals therefore overlap by construction: only `depth === 0`
 * rows (or every row's `direct*` values) can be summed into a grand total.
 * No `categoryId` means Uncategorized.
 */
export const CategoryRollupNodeSchema = z.object({
  categoryId: CategoryIdSchema.optional(),
  parentCategoryId: CategoryIdSchema.optional(),
  depth: CountSchema,
  name: z.string().min(1),
  icon: z.string().optional(),
  color: z.string().optional(),
  isArchived: z.boolean(),
  directSpentMinor: NonNegativeMinorSchema,
  directIncomeMinor: NonNegativeMinorSchema,
  directTxnCount: CountSchema,
  totalSpentMinor: NonNegativeMinorSchema,
  totalIncomeMinor: NonNegativeMinorSchema,
  totalTxnCount: CountSchema
});

export type CategoryRollupNode = z.infer<typeof CategoryRollupNodeSchema>;

export type CategoryTreeInput = Readonly<{ id: string; parentId?: string | null | undefined }>;

export type CategoryRollupMeta = CategoryTreeInput &
  Readonly<{
    name: string;
    icon?: string | null | undefined;
    color?: string | null | undefined;
    isArchived: boolean;
  }>;

export type DirectCategoryAmounts = Readonly<{
  categoryId?: string | null | undefined;
  spentMinor: number;
  incomeMinor: number;
  txnCount: number;
}>;

/** A category hierarchy normalized so that every id has at most one parent and no cycles. */
export type CategoryForest = Readonly<{
  parentById: ReadonlyMap<string, string>;
  childrenById: ReadonlyMap<string, readonly string[]>;
  roots: readonly string[];
}>;

export type CategoryRollupGroup = Readonly<{
  root: CategoryRollupNode;
  descendants: readonly CategoryRollupNode[];
}>;

/**
 * Normalizes raw `parentId` links. The API rejects cycles when writing, but
 * `categories.parent_id` has no database constraint, so readers must not trust
 * it: a parent outside `categories` (deleted, or another user's) makes the
 * category a root, and each cycle is broken by making its smallest id a root.
 * Breaking on the id keeps the result independent of input order.
 */
export function buildCategoryForest(categories: readonly CategoryTreeInput[]): CategoryForest {
  const knownIds = new Set(categories.map((category) => category.id));
  const parentById = new Map<string, string>();
  for (const { id, parentId } of categories) {
    if (typeof parentId === "string" && parentId !== id && knownIds.has(parentId)) {
      parentById.set(id, parentId);
    }
  }

  const settled = new Set<string>();
  for (const { id } of categories) {
    const path: string[] = [];
    const onPath = new Set<string>();
    let current: string | undefined = id;
    while (current !== undefined && !settled.has(current)) {
      if (onPath.has(current)) {
        const cycle = path.slice(path.indexOf(current));
        parentById.delete(cycle.reduce((lowest, member) => (member < lowest ? member : lowest)));
        break;
      }
      onPath.add(current);
      path.push(current);
      current = parentById.get(current);
    }
    for (const member of path) settled.add(member);
  }

  const childrenById = new Map<string, string[]>();
  const roots: string[] = [];
  for (const { id } of categories) {
    const parentId = parentById.get(id);
    if (parentId === undefined) {
      roots.push(id);
      continue;
    }
    const siblings = childrenById.get(parentId);
    if (siblings === undefined) childrenById.set(parentId, [id]);
    else siblings.push(id);
  }
  return { parentById, childrenById, roots };
}

/** `rootId` followed by all of its descendants, breadth-first. */
export function collectSubtreeIds(forest: CategoryForest, rootId: string): string[] {
  const ids = [rootId];
  for (const id of ids) ids.push(...(forest.childrenById.get(id) ?? []));
  return ids;
}

/** Nearest parent first, excluding `id` itself. */
export function collectAncestorIds(forest: CategoryForest, id: string): string[] {
  const ids: string[] = [];
  for (
    let parentId = forest.parentById.get(id);
    parentId !== undefined;
    parentId = forest.parentById.get(parentId)
  ) {
    ids.push(parentId);
  }
  return ids;
}

/**
 * Adds each category's amount to itself and every ancestor. The `null` key
 * (Uncategorized) has no place in the hierarchy and is left out.
 */
export function rollUpMinorAmounts(
  forest: CategoryForest,
  direct: ReadonlyMap<string | null, number>
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const [categoryId, amountMinor] of direct) {
    if (categoryId === null) continue;
    for (const id of [categoryId, ...collectAncestorIds(forest, categoryId)]) {
      totals.set(id, sumMinorAmounts([totals.get(id) ?? 0, amountMinor]));
    }
  }
  return totals;
}

type MutableAmounts = { spentMinor: number; incomeMinor: number; txnCount: number };

function addAmounts(target: MutableAmounts, amounts: DirectCategoryAmounts): void {
  target.spentMinor = sumMinorAmounts([target.spentMinor, amounts.spentMinor]);
  target.incomeMinor = sumMinorAmounts([target.incomeMinor, amounts.incomeMinor]);
  target.txnCount += amounts.txnCount;
}

function emptyAmounts(): MutableAmounts {
  return { spentMinor: 0, incomeMinor: 0, txnCount: 0 };
}

/**
 * Turns per-category direct amounts into a flat, pre-ordered breakdown, siblings
 * largest-spend-first. Categories with no activity in their subtree are pruned.
 * `categories` must include archived ones so that their history keeps rolling
 * up. A direct amount whose category is not in `categories` becomes its own
 * root rather than disappearing, so that depth-0 totals always equal the sum of
 * the input.
 */
export function buildCategoryRollupNodes(
  categories: readonly CategoryRollupMeta[],
  direct: readonly DirectCategoryAmounts[]
): CategoryRollupNode[] {
  const metaById = new Map<string, CategoryRollupMeta>(
    categories.map((category) => [category.id, category])
  );
  for (const { categoryId } of direct) {
    if (typeof categoryId === "string" && !metaById.has(categoryId)) {
      metaById.set(categoryId, { id: categoryId, name: UNAVAILABLE_NAME, isArchived: false });
    }
  }
  const forest = buildCategoryForest([...metaById.values()]);

  const directById = new Map<string, MutableAmounts>();
  const totalById = new Map<string, MutableAmounts>();
  const uncategorized = emptyAmounts();
  let hasUncategorized = false;
  for (const amounts of direct) {
    const { categoryId } = amounts;
    if (typeof categoryId !== "string") {
      addAmounts(uncategorized, amounts);
      hasUncategorized = true;
      continue;
    }
    const own = directById.get(categoryId) ?? emptyAmounts();
    addAmounts(own, amounts);
    directById.set(categoryId, own);
    for (const id of [categoryId, ...collectAncestorIds(forest, categoryId)]) {
      const total = totalById.get(id) ?? emptyAmounts();
      addAmounts(total, amounts);
      totalById.set(id, total);
    }
  }

  type SortableRoot = Readonly<{ name: string; id: string; total: MutableAmounts }>;
  const compare = (left: SortableRoot, right: SortableRoot): number =>
    right.total.spentMinor - left.total.spentMinor ||
    right.total.incomeMinor - left.total.incomeMinor ||
    left.name.localeCompare(right.name) ||
    left.id.localeCompare(right.id);
  const activeSorted = (ids: readonly string[]): SortableRoot[] =>
    ids
      .flatMap((id) => {
        const total = totalById.get(id);
        const meta = metaById.get(id);
        return total === undefined || meta === undefined ? [] : [{ id, name: meta.name, total }];
      })
      .sort(compare);

  const nodes: CategoryRollupNode[] = [];
  const visit = (id: string, depth: number, parentCategoryId: string | undefined): void => {
    const meta = metaById.get(id);
    const total = totalById.get(id);
    if (meta === undefined || total === undefined) return;
    const own = directById.get(id) ?? emptyAmounts();
    nodes.push({
      categoryId: id,
      ...(parentCategoryId === undefined ? {} : { parentCategoryId }),
      depth,
      name: meta.name,
      ...(typeof meta.icon === "string" ? { icon: meta.icon } : {}),
      ...(typeof meta.color === "string" ? { color: meta.color } : {}),
      isArchived: meta.isArchived,
      directSpentMinor: own.spentMinor,
      directIncomeMinor: own.incomeMinor,
      directTxnCount: own.txnCount,
      totalSpentMinor: total.spentMinor,
      totalIncomeMinor: total.incomeMinor,
      totalTxnCount: total.txnCount
    });
    for (const child of activeSorted(forest.childrenById.get(id) ?? [])) {
      visit(child.id, depth + 1, id);
    }
  };

  const uncategorizedRoot: SortableRoot | null = hasUncategorized
    ? { id: "", name: UNCATEGORIZED_NAME, total: uncategorized }
    : null;
  const roots = activeSorted(forest.roots);
  if (uncategorizedRoot !== null) {
    roots.push(uncategorizedRoot);
    roots.sort(compare);
  }
  for (const root of roots) {
    if (root === uncategorizedRoot) {
      nodes.push({
        depth: 0,
        name: UNCATEGORIZED_NAME,
        isArchived: false,
        directSpentMinor: uncategorized.spentMinor,
        directIncomeMinor: uncategorized.incomeMinor,
        directTxnCount: uncategorized.txnCount,
        totalSpentMinor: uncategorized.spentMinor,
        totalIncomeMinor: uncategorized.incomeMinor,
        totalTxnCount: uncategorized.txnCount
      });
    } else {
      visit(root.id, 0, undefined);
    }
  }
  return nodes;
}

/** Splits a pre-ordered node list back into each depth-0 root and the rows beneath it. */
export function groupCategoryRollupNodes(
  nodes: readonly CategoryRollupNode[]
): CategoryRollupGroup[] {
  const groups: { root: CategoryRollupNode; descendants: CategoryRollupNode[] }[] = [];
  for (const node of nodes) {
    const current = groups.at(-1);
    if (node.depth === 0 || current === undefined) groups.push({ root: node, descendants: [] });
    else current.descendants.push(node);
  }
  return groups;
}
