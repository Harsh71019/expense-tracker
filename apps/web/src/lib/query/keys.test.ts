import { describe, expect, it } from "vitest";

import { qk } from "./keys";

describe("query keys", () => {
  it("keeps transaction filters and stable collection keys distinct", () => {
    expect(qk.txns({ limit: 25, q: "chai" })).toEqual(["txns", { limit: 25, q: "chai" }]);
    expect(qk.accounts()).toEqual(["accounts"]);
    expect(qk.categories()).toEqual(["categories"]);
  });
});
