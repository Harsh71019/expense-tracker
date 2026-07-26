import { describe, expect, it } from "vitest";

import { qk } from "./keys";

describe("query keys", () => {
  it("keeps resource families hierarchical and stable", () => {
    expect(qk.transactions()).toEqual(["transactions"]);
    expect(qk.transactionLists()).toEqual(["transactions", "list"]);
    expect(qk.txns({ limit: 25, q: "chai" })).toEqual([
      "transactions",
      "list",
      { limit: 25, q: "chai" }
    ]);
    expect(qk.transactionDetails()).toEqual(["transactions", "detail"]);
    expect(qk.txn("txn-1")).toEqual(["transactions", "detail", "txn-1"]);
    expect(qk.goals()).toEqual(["goals"]);
    expect(qk.goalList("active")).toEqual(["goals", "list", "active"]);
    expect(qk.goal("goal-1")).toEqual(["goals", "detail", "goal-1"]);
    expect(qk.goalPlan("goal-1")).toEqual(["goals", "plan", "goal-1"]);
    expect(qk.budgets()).toEqual(["budgets"]);
    expect(qk.budgetLists()).toEqual(["budgets", "list"]);
    expect(qk.budgetList({ includeArchived: true, limit: 50 })).toEqual([
      "budgets",
      "list",
      { includeArchived: true, limit: 50 }
    ]);
    expect(qk.accounts()).toEqual(["accounts"]);
    expect(qk.categories()).toEqual(["categories"]);
    expect(qk.spendingWarnings()).toEqual(["spending-warnings"]);
    expect(qk.spendingWarningLists()).toEqual(["spending-warnings", "list"]);
    expect(qk.spendingWarningList({ filter: "spikes" })).toEqual([
      "spending-warnings",
      "list",
      { filter: "spikes" }
    ]);
  });
});
