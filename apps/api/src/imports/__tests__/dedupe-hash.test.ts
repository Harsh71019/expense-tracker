import { describe, expect, it } from "vitest";

import { computeDedupeHash, normalizeDescription } from "../dedupe-hash.js";

describe("normalizeDescription", () => {
  it("lowercases and collapses whitespace", () => {
    expect(normalizeDescription("  Swiggy   Order  ")).toBe("swiggy order");
  });

  it("strips long digit runs (UPI/bank reference numbers)", () => {
    expect(normalizeDescription("UPI/1234567890123/Chai Point")).toBe("upi//chai point");
  });

  it("leaves short digit runs alone (e.g. a shop number)", () => {
    expect(normalizeDescription("Shop 42 Chai")).toBe("shop 42 chai");
  });
});

describe("computeDedupeHash", () => {
  it("is deterministic for identical inputs", () => {
    const a = computeDedupeHash("user-a", "acc-1", new Date("2026-07-04T09:00:00Z"), 2_000, "Chai");
    const b = computeDedupeHash("user-a", "acc-1", new Date("2026-07-04T09:00:00Z"), 2_000, "Chai");
    expect(a).toBe(b);
  });

  it("matches across the same IST calendar day regardless of time-of-day", () => {
    const morning = computeDedupeHash(
      "user-a",
      "acc-1",
      new Date("2026-07-04T01:00:00Z"),
      2_000,
      "Chai"
    );
    const evening = computeDedupeHash(
      "user-a",
      "acc-1",
      new Date("2026-07-04T15:00:00Z"),
      2_000,
      "Chai"
    );
    expect(morning).toBe(evening);
  });

  it("matches across differently-cased/spaced/UPI-ref-suffixed descriptions", () => {
    const a = computeDedupeHash(
      "user-a",
      "acc-1",
      new Date("2026-07-04T09:00:00Z"),
      2_000,
      "UPI/1234567890123/Chai Point"
    );
    const b = computeDedupeHash(
      "user-a",
      "acc-1",
      new Date("2026-07-04T09:00:00Z"),
      2_000,
      "upi/9876543210987/CHAI   POINT"
    );
    expect(a).toBe(b);
  });

  it("differs when the user, account, amount, or day differs", () => {
    const base = computeDedupeHash(
      "user-a",
      "acc-1",
      new Date("2026-07-04T09:00:00Z"),
      2_000,
      "Chai"
    );
    expect(
      computeDedupeHash("user-b", "acc-1", new Date("2026-07-04T09:00:00Z"), 2_000, "Chai")
    ).not.toBe(base);
    expect(
      computeDedupeHash("user-a", "acc-2", new Date("2026-07-04T09:00:00Z"), 2_000, "Chai")
    ).not.toBe(base);
    expect(
      computeDedupeHash("user-a", "acc-1", new Date("2026-07-04T09:00:00Z"), 2_500, "Chai")
    ).not.toBe(base);
    expect(
      computeDedupeHash("user-a", "acc-1", new Date("2026-07-05T09:00:00Z"), 2_000, "Chai")
    ).not.toBe(base);
  });
});
