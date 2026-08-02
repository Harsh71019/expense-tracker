import { describe, expect, it } from "vitest";

import {
  matchIncomingTransaction,
  type RecurringCandidate
} from "../recurring-reconciliation-matcher.js";

const ACCOUNT_ID = "3fa85f64-5717-4562-b3fc-2c963f66beef";
const OTHER_ACCOUNT_ID = "4fa85f64-5717-4562-b3fc-2c963f66beef";
const RULE_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_RULE_ID = "22222222-2222-4222-8222-222222222222";

function candidate(overrides: Partial<RecurringCandidate> = {}): RecurringCandidate {
  return {
    transactionId: "33333333-3333-4333-8333-333333333333",
    ruleId: RULE_ID,
    accountId: ACCOUNT_ID,
    type: "expense",
    amountMinor: 200_000,
    occurredAt: new Date("2026-08-01T00:00:00.000Z"),
    templateDescription: "Recurring charge",
    ...overrides
  };
}

describe("matchIncomingTransaction", () => {
  it("auto-matches a unique same-account, same-amount, in-window candidate", () => {
    const result = matchIncomingTransaction(
      {
        accountId: ACCOUNT_ID,
        type: "expense",
        amountMinor: 200_000,
        occurredAt: new Date("2026-08-01T00:00:00.000Z"),
        description: "Bank debit"
      },
      [candidate()]
    );
    expect(result).toEqual({
      outcome: "auto_matched",
      recurringTransactionId: "33333333-3333-4333-8333-333333333333",
      recurringRuleId: RULE_ID
    });
  });

  it("tolerates a few days of posting delay within the window", () => {
    const result = matchIncomingTransaction(
      {
        accountId: ACCOUNT_ID,
        type: "expense",
        amountMinor: 200_000,
        occurredAt: new Date("2026-08-03T00:00:00.000Z"),
        description: "Bank debit"
      },
      [candidate({ occurredAt: new Date("2026-08-01T00:00:00.000Z") })]
    );
    expect(result.outcome).toBe("auto_matched");
  });

  it("flags two equally-good same-amount candidates as ambiguous", () => {
    const result = matchIncomingTransaction(
      {
        accountId: ACCOUNT_ID,
        type: "expense",
        amountMinor: 200_000,
        occurredAt: new Date("2026-08-01T00:00:00.000Z"),
        description: "Bank debit"
      },
      [
        candidate({ transactionId: "33333333-3333-4333-8333-333333333333", ruleId: RULE_ID }),
        candidate({ transactionId: "44444444-4444-4444-8444-444444444444", ruleId: OTHER_RULE_ID })
      ]
    );
    expect(result).toEqual({
      outcome: "ambiguous",
      candidateTransactionIds: [
        "33333333-3333-4333-8333-333333333333",
        "44444444-4444-4444-8444-444444444444"
      ]
    });
  });

  it("flags a same-account, in-window candidate with a different amount as amount_mismatch", () => {
    const result = matchIncomingTransaction(
      {
        accountId: ACCOUNT_ID,
        type: "expense",
        amountMinor: 250_000,
        occurredAt: new Date("2026-08-01T00:00:00.000Z"),
        description: "Bank debit"
      },
      [candidate({ amountMinor: 200_000 })]
    );
    expect(result).toEqual({
      outcome: "amount_mismatch",
      candidateTransactionIds: ["33333333-3333-4333-8333-333333333333"]
    });
  });

  it("ignores a candidate on a different account", () => {
    const result = matchIncomingTransaction(
      {
        accountId: ACCOUNT_ID,
        type: "expense",
        amountMinor: 200_000,
        occurredAt: new Date("2026-08-01T00:00:00.000Z"),
        description: "Bank debit"
      },
      [candidate({ accountId: OTHER_ACCOUNT_ID })]
    );
    expect(result).toEqual({ outcome: "no_match" });
  });

  it("ignores a candidate of the wrong transaction type", () => {
    const result = matchIncomingTransaction(
      {
        accountId: ACCOUNT_ID,
        type: "income",
        amountMinor: 200_000,
        occurredAt: new Date("2026-08-01T00:00:00.000Z"),
        description: "Bank debit"
      },
      [candidate({ type: "expense" })]
    );
    expect(result).toEqual({ outcome: "no_match" });
  });

  it("ignores a candidate outside the reconciliation window", () => {
    const result = matchIncomingTransaction(
      {
        accountId: ACCOUNT_ID,
        type: "expense",
        amountMinor: 200_000,
        occurredAt: new Date("2026-08-10T00:00:00.000Z"),
        description: "Bank debit"
      },
      [candidate({ occurredAt: new Date("2026-08-01T00:00:00.000Z") })]
    );
    expect(result).toEqual({ outcome: "no_match" });
  });

  it("returns no_match for an empty candidate list", () => {
    const result = matchIncomingTransaction(
      {
        accountId: ACCOUNT_ID,
        type: "expense",
        amountMinor: 200_000,
        occurredAt: new Date("2026-08-01T00:00:00.000Z"),
        description: "Bank debit"
      },
      []
    );
    expect(result).toEqual({ outcome: "no_match" });
  });

  it("auto-matches via a shared mandate reference token even when the amount changed", () => {
    const result = matchIncomingTransaction(
      {
        accountId: ACCOUNT_ID,
        type: "expense",
        amountMinor: 249_900,
        occurredAt: new Date("2026-08-01T00:00:00.000Z"),
        description: "CARD/EMANDATE/Anthropic/mandate:YIcCmzpAfi"
      },
      [candidate({ amountMinor: 199_900, templateDescription: "Anthropic (mandate:YIcCmzpAfi)" })]
    );
    expect(result).toEqual({
      outcome: "auto_matched",
      recurringTransactionId: "33333333-3333-4333-8333-333333333333",
      recurringRuleId: RULE_ID
    });
  });

  it("flags two candidates sharing the same mandate reference token as ambiguous", () => {
    const result = matchIncomingTransaction(
      {
        accountId: ACCOUNT_ID,
        type: "expense",
        amountMinor: 249_900,
        occurredAt: new Date("2026-08-01T00:00:00.000Z"),
        description: "CARD/EMANDATE/Anthropic/mandate:YIcCmzpAfi"
      },
      [
        candidate({
          transactionId: "33333333-3333-4333-8333-333333333333",
          ruleId: RULE_ID,
          templateDescription: "Anthropic (mandate:YIcCmzpAfi)"
        }),
        candidate({
          transactionId: "44444444-4444-4444-8444-444444444444",
          ruleId: OTHER_RULE_ID,
          templateDescription: "Duplicate rule (mandate:YIcCmzpAfi)"
        })
      ]
    );
    expect(result).toEqual({
      outcome: "ambiguous",
      candidateTransactionIds: [
        "33333333-3333-4333-8333-333333333333",
        "44444444-4444-4444-8444-444444444444"
      ]
    });
  });

  it("falls back to amount/window matching when descriptions share no reference token", () => {
    const result = matchIncomingTransaction(
      {
        accountId: ACCOUNT_ID,
        type: "expense",
        amountMinor: 200_000,
        occurredAt: new Date("2026-08-01T00:00:00.000Z"),
        description: "CARD/EMANDATE/Anthropic/mandate:YIcCmzpAfi"
      },
      [candidate({ amountMinor: 200_000, templateDescription: "Netflix (mandate:XYp7DcGXwW)" })]
    );
    expect(result.outcome).toBe("auto_matched");
  });
});
