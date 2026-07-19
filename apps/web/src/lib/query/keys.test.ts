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
    expect(qk.accounts()).toEqual(["accounts"]);
    expect(qk.categories()).toEqual(["categories"]);
  });
});
