import { describe, expect, it } from "vitest";

import { computeDedupeFingerprintV2 } from "../dedupe-fingerprint-v2.js";
import { computeDedupeHash } from "../dedupe-hash.js";

describe("computeDedupeFingerprintV2", () => {
  it("is deterministic for identical inputs", () => {
    const a = computeDedupeFingerprintV2(
      "user-a",
      "acc-1",
      "expense",
      new Date("2026-07-04T09:00:00Z"),
      2_000,
      "Chai"
    );
    const b = computeDedupeFingerprintV2(
      "user-a",
      "acc-1",
      "expense",
      new Date("2026-07-04T09:00:00Z"),
      2_000,
      "Chai"
    );
    expect(a).toBe(b);
  });

  it("matches across the same IST calendar day regardless of time-of-day", () => {
    const morning = computeDedupeFingerprintV2(
      "user-a",
      "acc-1",
      "expense",
      new Date("2026-07-04T01:00:00Z"),
      2_000,
      "Chai"
    );
    const evening = computeDedupeFingerprintV2(
      "user-a",
      "acc-1",
      "expense",
      new Date("2026-07-04T15:00:00Z"),
      2_000,
      "Chai"
    );
    expect(morning).toBe(evening);
  });

  it("matches across differently-cased/spaced/UPI-ref-suffixed descriptions", () => {
    const a = computeDedupeFingerprintV2(
      "user-a",
      "acc-1",
      "expense",
      new Date("2026-07-04T09:00:00Z"),
      2_000,
      "UPI/418923456789/Chai Point"
    );
    const b = computeDedupeFingerprintV2(
      "user-a",
      "acc-1",
      "expense",
      new Date("2026-07-04T09:00:00Z"),
      2_000,
      "upi/987654321098/CHAI   POINT"
    );
    expect(a).toBe(b);
  });

  it("differs when the transaction type differs — the v1 gap this closes", () => {
    // v1 hashing (no type) treats a same-day/same-amount/same-narration
    // expense and its reversal as identical; v2 must not.
    const expense = computeDedupeFingerprintV2(
      "user-a",
      "acc-1",
      "expense",
      new Date("2026-07-04T09:00:00Z"),
      2_000,
      "Chai"
    );
    const income = computeDedupeFingerprintV2(
      "user-a",
      "acc-1",
      "income",
      new Date("2026-07-04T09:00:00Z"),
      2_000,
      "Chai"
    );
    expect(expense).not.toBe(income);

    const v1Expense = computeDedupeHash(
      "user-a",
      "acc-1",
      new Date("2026-07-04T09:00:00Z"),
      2_000,
      "Chai"
    );
    const v1Income = computeDedupeHash(
      "user-a",
      "acc-1",
      new Date("2026-07-04T09:00:00Z"),
      2_000,
      "Chai"
    );
    // The v1 hash genuinely does collide here, proving the gap is real.
    expect(v1Expense).toBe(v1Income);
  });

  it("differs when the user, account, amount, or day differs", () => {
    const base = computeDedupeFingerprintV2(
      "user-a",
      "acc-1",
      "expense",
      new Date("2026-07-04T09:00:00Z"),
      2_000,
      "Chai"
    );
    expect(
      computeDedupeFingerprintV2(
        "user-b",
        "acc-1",
        "expense",
        new Date("2026-07-04T09:00:00Z"),
        2_000,
        "Chai"
      )
    ).not.toBe(base);
    expect(
      computeDedupeFingerprintV2(
        "user-a",
        "acc-2",
        "expense",
        new Date("2026-07-04T09:00:00Z"),
        2_000,
        "Chai"
      )
    ).not.toBe(base);
    expect(
      computeDedupeFingerprintV2(
        "user-a",
        "acc-1",
        "expense",
        new Date("2026-07-04T09:00:00Z"),
        2_500,
        "Chai"
      )
    ).not.toBe(base);
    expect(
      computeDedupeFingerprintV2(
        "user-a",
        "acc-1",
        "expense",
        new Date("2026-07-05T09:00:00Z"),
        2_000,
        "Chai"
      )
    ).not.toBe(base);
  });

  it("differs from the v1 hash for the same underlying transaction (disjoint fingerprint space)", () => {
    const v1 = computeDedupeHash(
      "user-a",
      "acc-1",
      new Date("2026-07-04T09:00:00Z"),
      2_000,
      "Chai"
    );
    const v2 = computeDedupeFingerprintV2(
      "user-a",
      "acc-1",
      "expense",
      new Date("2026-07-04T09:00:00Z"),
      2_000,
      "Chai"
    );
    expect(v2).not.toBe(v1);
  });

  it("returns a 64-character lowercase hex sha256 digest", () => {
    const fingerprint = computeDedupeFingerprintV2(
      "user-a",
      "acc-1",
      "expense",
      new Date("2026-07-04T09:00:00Z"),
      2_000,
      "Chai"
    );
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });
});
