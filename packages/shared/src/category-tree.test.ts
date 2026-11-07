import { describe, expect, it } from "vitest";

import {
  buildCategoryForest,
  buildCategoryRollupNodes,
  CategoryRollupNodeSchema,
  collectAncestorIds,
  collectSubtreeIds,
  groupCategoryRollupNodes,
  rollUpMinorAmounts
} from "./category-tree.js";

const TRANSPORT = "00000000-0000-4000-8000-000000000001";
const CAB = "00000000-0000-4000-8000-000000000002";
const UBER = "00000000-0000-4000-8000-000000000003";
const RENT = "00000000-0000-4000-8000-000000000004";
const GONE = "00000000-0000-4000-8000-00000000000f";

const meta = (id: string, name: string, parentId?: string, isArchived = false) => ({
  id,
  name,
  isArchived,
  ...(parentId === undefined ? {} : { parentId })
});
const NESTED = [
  meta(TRANSPORT, "Transportation"),
  meta(CAB, "Cab / Rideshare", TRANSPORT),
  meta(UBER, "Uber", CAB),
  meta(RENT, "Rent")
];
const spend = (categoryId: string | undefined, spentMinor: number, txnCount = 1) => ({
  ...(categoryId === undefined ? {} : { categoryId }),
  spentMinor,
  incomeMinor: 0,
  txnCount
});

describe("buildCategoryForest", () => {
  it("links a three-level tree", () => {
    const forest = buildCategoryForest(NESTED);
    expect(forest.roots).toEqual([TRANSPORT, RENT]);
    expect(collectSubtreeIds(forest, TRANSPORT)).toEqual([TRANSPORT, CAB, UBER]);
    expect(collectSubtreeIds(forest, CAB)).toEqual([CAB, UBER]);
    expect(collectSubtreeIds(forest, UBER)).toEqual([UBER]);
    expect(collectAncestorIds(forest, UBER)).toEqual([CAB, TRANSPORT]);
  });

  it("treats a missing parent, a null parent and a self-parent as roots", () => {
    const forest = buildCategoryForest([
      { id: "a", parentId: "missing" },
      { id: "b", parentId: null },
      { id: "c", parentId: "c" }
    ]);
    expect(forest.roots).toEqual(["a", "b", "c"]);
    expect(forest.parentById.size).toBe(0);
  });

  it.each([
    ["two-node", ["b", "a"]],
    ["reversed input", ["a", "b"]]
  ])("breaks a %s cycle at the smallest id", (_label, order) => {
    const parents: Record<string, string> = { a: "b", b: "a" };
    const forest = buildCategoryForest(order.map((id) => ({ id, parentId: parents[id] ?? null })));
    expect(forest.roots).toEqual(["a"]);
    expect(collectSubtreeIds(forest, "a")).toEqual(["a", "b"]);
    expect(collectSubtreeIds(forest, "b")).toEqual(["b"]);
  });

  it("terminates on a longer cycle with a tail hanging off it", () => {
    const forest = buildCategoryForest([
      { id: "tail", parentId: "c" },
      { id: "c", parentId: "b" },
      { id: "b", parentId: "a" },
      { id: "a", parentId: "c" }
    ]);
    expect(forest.roots).toEqual(["a"]);
    expect(collectSubtreeIds(forest, "a").sort()).toEqual(["a", "b", "c", "tail"]);
    expect(collectAncestorIds(forest, "tail")).toEqual(["c", "b", "a"]);
  });

  it("returns just the id for a category it does not know", () => {
    expect(collectSubtreeIds(buildCategoryForest([]), "unknown")).toEqual(["unknown"]);
  });
});

describe("rollUpMinorAmounts", () => {
  it("adds each amount to the category and every ancestor, ignoring Uncategorized", () => {
    const totals = rollUpMinorAmounts(
      buildCategoryForest(NESTED),
      new Map<string | null, number>([
        [UBER, 500],
        [CAB, 200],
        [TRANSPORT, 100],
        [null, 999]
      ])
    );
    expect(totals.get(UBER)).toBe(500);
    expect(totals.get(CAB)).toBe(700);
    expect(totals.get(TRANSPORT)).toBe(800);
    expect(totals.has("null")).toBe(false);
    expect(totals.size).toBe(3);
  });
});

describe("buildCategoryRollupNodes", () => {
  it("rolls up three levels in pre-order with direct and total amounts", () => {
    const nodes = buildCategoryRollupNodes(NESTED, [
      spend(UBER, 500, 2),
      spend(CAB, 200),
      spend(TRANSPORT, 100),
      spend(RENT, 900)
    ]);

    for (const node of nodes) expect(CategoryRollupNodeSchema.safeParse(node).success).toBe(true);
    expect(
      nodes.map((node) => [
        node.name,
        node.depth,
        node.directSpentMinor,
        node.totalSpentMinor,
        node.totalTxnCount
      ])
    ).toEqual([
      ["Rent", 0, 900, 900, 1],
      ["Transportation", 0, 100, 800, 4],
      ["Cab / Rideshare", 1, 200, 700, 3],
      ["Uber", 2, 500, 500, 2]
    ]);
    expect(nodes[3]?.parentCategoryId).toBe(CAB);
  });

  it("never double counts: depth-0 totals and all direct amounts both equal the input", () => {
    const input = [spend(UBER, 500), spend(CAB, 200), spend(undefined, 75), spend(RENT, 900)];
    const nodes = buildCategoryRollupNodes(NESTED, input);
    const grandTotal = input.reduce((sum, row) => sum + row.spentMinor, 0);

    const rootTotal = nodes
      .filter((node) => node.depth === 0)
      .reduce((sum, node) => sum + node.totalSpentMinor, 0);
    const directTotal = nodes.reduce((sum, node) => sum + node.directSpentMinor, 0);
    expect(rootTotal).toBe(grandTotal);
    expect(directTotal).toBe(grandTotal);
  });

  it("keeps an archived child's history under its active parent and flags it", () => {
    const nodes = buildCategoryRollupNodes(
      [meta(TRANSPORT, "Transportation"), meta(CAB, "Old cab", TRANSPORT, true)],
      [spend(CAB, 300)]
    );
    expect(nodes.map((node) => [node.name, node.totalSpentMinor, node.isArchived])).toEqual([
      ["Transportation", 300, false],
      ["Old cab", 300, true]
    ]);
  });

  it("keeps spend on a category it cannot resolve as its own root", () => {
    const nodes = buildCategoryRollupNodes(NESTED, [spend(GONE, 40)]);
    expect(nodes).toEqual([
      expect.objectContaining({
        categoryId: GONE,
        name: "Unavailable category",
        depth: 0,
        totalSpentMinor: 40
      })
    ]);
  });

  it("merges repeated rows and prunes categories with no activity", () => {
    const nodes = buildCategoryRollupNodes(NESTED, [spend(UBER, 1), spend(UBER, 2)]);
    expect(nodes.map((node) => node.name)).toEqual(["Transportation", "Cab / Rideshare", "Uber"]);
    expect(nodes[2]?.directSpentMinor).toBe(3);
    expect(nodes[2]?.directTxnCount).toBe(2);
  });

  it("does not double count or hang on a cycle", () => {
    const nodes = buildCategoryRollupNodes(
      [
        { id: "a", name: "A", parentId: "b", isArchived: false },
        { id: "b", name: "B", parentId: "a", isArchived: false }
      ],
      [spend("a", 10), spend("b", 20)]
    );
    expect(nodes.map((node) => [node.name, node.depth, node.totalSpentMinor])).toEqual([
      ["A", 0, 30],
      ["B", 1, 20]
    ]);
  });

  it("orders an Uncategorized root by its spend", () => {
    const nodes = buildCategoryRollupNodes(NESTED, [spend(RENT, 10), spend(undefined, 20)]);
    expect(nodes.map((node) => node.name)).toEqual(["Uncategorized", "Rent"]);
    expect(nodes[0]?.categoryId).toBeUndefined();
  });

  it("throws rather than losing precision on overflow", () => {
    expect(() =>
      buildCategoryRollupNodes(NESTED, [
        spend(RENT, Number.MAX_SAFE_INTEGER),
        spend(RENT, Number.MAX_SAFE_INTEGER)
      ])
    ).toThrow(RangeError);
  });
});

describe("groupCategoryRollupNodes", () => {
  it("groups descendants beneath their root", () => {
    const groups = groupCategoryRollupNodes(
      buildCategoryRollupNodes(NESTED, [spend(UBER, 500), spend(RENT, 100)])
    );
    expect(groups.map((group) => [group.root.name, group.descendants.length])).toEqual([
      ["Transportation", 2],
      ["Rent", 0]
    ]);
  });
});
