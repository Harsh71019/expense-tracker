import { describe, expect, it } from "vitest";

import {
  evaluateNearDuplicates,
  NEAR_DUPLICATE_ALGORITHM_VERSION,
  type NearDuplicateCandidate
} from "../near-duplicate-scoring.js";

function candidate(overrides: Partial<NearDuplicateCandidate> = {}): NearDuplicateCandidate {
  return {
    transactionId: "11111111-1111-1111-1111-111111111111",
    description: "Swiggy order 44",
    source: "manual",
    occurredAt: new Date("2026-07-04T09:00:00Z"),
    ...overrides
  };
}

describe("evaluateNearDuplicates", () => {
  it("abstains with no_candidates when there is nothing to compare against", () => {
    const result = evaluateNearDuplicates(
      { description: "Swiggy order 44", occurredAt: new Date("2026-07-04T09:00:00Z") },
      []
    );
    expect(result).toEqual({
      outcome: "abstained",
      reason: "no_candidates",
      algorithmVersion: NEAR_DUPLICATE_ALGORITHM_VERSION
    });
  });

  it("abstains with insufficient_evidence when every candidate scores below threshold", () => {
    const result = evaluateNearDuplicates(
      { description: "Swiggy order 44", occurredAt: new Date("2026-07-04T09:00:00Z") },
      [candidate({ description: "Electricity bill BESCOM" })]
    );
    expect(result.outcome).toBe("abstained");
    expect(result).toMatchObject({ reason: "insufficient_evidence" });
  });

  it("matches on an exact extracted bank reference — the strongest evidence", () => {
    const result = evaluateNearDuplicates(
      {
        description: "UPI/RRN418923456789/SWIGGY LTD/order 44",
        occurredAt: new Date("2026-07-04T09:00:00Z")
      },
      [
        candidate({
          transactionId: "22222222-2222-2222-2222-222222222222",
          description: "UPI/RRN418923456789/SWIGGY LTD/order 44"
        })
      ]
    );
    expect(result.outcome).toBe("match");
    if (result.outcome !== "match") throw new Error("expected a match");
    expect(result.evidence).toMatchObject({
      method: "exact_reference",
      hasExactReferenceMatch: true,
      candidateTransactionId: "22222222-2222-2222-2222-222222222222",
      algorithmVersion: NEAR_DUPLICATE_ALGORITHM_VERSION
    });
    expect(result.evidence.confidenceBps).toBeGreaterThanOrEqual(9_000);
  });

  it("matches on a shared normalized counterparty key when there is no exact reference", () => {
    const result = evaluateNearDuplicates(
      { description: "UPI/999999999999/SWIGGY LTD", occurredAt: new Date("2026-07-04T09:00:00Z") },
      [
        candidate({
          transactionId: "33333333-3333-3333-3333-333333333333",
          description: "UPI/111111111111/SWIGGY LTD"
        })
      ]
    );
    expect(result.outcome).toBe("match");
    if (result.outcome !== "match") throw new Error("expected a match");
    expect(result.evidence).toMatchObject({
      method: "counterparty_key",
      hasExactReferenceMatch: false,
      hasCounterpartyKeyMatch: true
    });
  });

  it("falls back to token Jaccard similarity when neither reference nor counterparty key match", () => {
    const result = evaluateNearDuplicates(
      { description: "Chai Point Koramangala", occurredAt: new Date("2026-07-04T09:00:00Z") },
      [candidate({ description: "Chai Point Indiranagar" })]
    );
    expect(result.outcome).toBe("match");
    if (result.outcome !== "match") throw new Error("expected a match");
    expect(result.evidence.method).toBe("token_jaccard");
    expect(result.evidence.confidenceBps).toBeGreaterThan(0);
    expect(result.evidence.confidenceBps).toBeLessThan(10_000);
  });

  it("returns ambiguous when two candidates are too close to call", () => {
    const result = evaluateNearDuplicates(
      { description: "Chai Point Koramangala", occurredAt: new Date("2026-07-04T09:00:00Z") },
      [
        candidate({
          transactionId: "44444444-4444-4444-4444-444444444444",
          description: "Chai Point Koramangala Store"
        }),
        candidate({
          transactionId: "55555555-5555-5555-5555-555555555555",
          description: "Chai Point Koramangala Outlet"
        })
      ]
    );
    expect(result.outcome).toBe("ambiguous");
    if (result.outcome !== "ambiguous") throw new Error("expected ambiguous");
    expect(result.candidateCount).toBe(2);
  });

  it("breaks confidence ties deterministically by candidate transaction id", () => {
    const first = evaluateNearDuplicates(
      { description: "Chai Point", occurredAt: new Date("2026-07-04T09:00:00Z") },
      [
        candidate({
          transactionId: "99999999-9999-9999-9999-999999999999",
          description: "Chai Point"
        }),
        candidate({
          transactionId: "11111111-1111-1111-1111-111111111111",
          description: "Chai Point"
        })
      ]
    );
    // Identical scores for both -> ambiguous, but topEvidence must be the
    // lexicographically-smaller id, deterministically, not insertion order.
    expect(first.outcome).toBe("ambiguous");
    if (first.outcome !== "ambiguous") throw new Error("expected ambiguous");
    expect(first.topEvidence.candidateTransactionId).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("reports calendar-day distance between the target and the candidate", () => {
    const result = evaluateNearDuplicates(
      {
        description: "UPI/RRN418923456789/SWIGGY",
        occurredAt: new Date("2026-07-04T09:00:00Z")
      },
      [
        candidate({
          description: "UPI/RRN418923456789/SWIGGY",
          occurredAt: new Date("2026-07-05T09:00:00Z")
        })
      ]
    );
    expect(result.outcome).toBe("match");
    if (result.outcome !== "match") throw new Error("expected a match");
    expect(result.evidence.calendarDayDistance).toBe(1);
  });

  it("keeps confidenceBps within the 0-10,000 basis-point contract", () => {
    const result = evaluateNearDuplicates(
      { description: "Chai Point", occurredAt: new Date("2026-07-04T09:00:00Z") },
      [candidate({ description: "Chai Point" })]
    );
    expect(result.outcome).toBe("match");
    if (result.outcome !== "match") throw new Error("expected a match");
    expect(result.evidence.confidenceBps).toBeGreaterThanOrEqual(0);
    expect(result.evidence.confidenceBps).toBeLessThanOrEqual(10_000);
  });

  it("carries the candidate's transaction source through as evidence for source-pair review", () => {
    const result = evaluateNearDuplicates(
      { description: "Chai Point", occurredAt: new Date("2026-07-04T09:00:00Z") },
      [candidate({ description: "Chai Point", source: "csv_import" })]
    );
    expect(result.outcome).toBe("match");
    if (result.outcome !== "match") throw new Error("expected a match");
    expect(result.evidence.candidateSource).toBe("csv_import");
  });
});
