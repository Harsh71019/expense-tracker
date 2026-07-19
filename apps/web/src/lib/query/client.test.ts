import { describe, expect, it } from "vitest";

import { makeQueryClient } from "./client";

describe("makeQueryClient", () => {
  it("returns an isolated cache for every request or browser provider", () => {
    const first = makeQueryClient();
    const second = makeQueryClient();

    first.setQueryData(["profile"], { email: "first@example.com" });

    expect(second).not.toBe(first);
    expect(second.getQueryData(["profile"])).toBeUndefined();
  });
});
