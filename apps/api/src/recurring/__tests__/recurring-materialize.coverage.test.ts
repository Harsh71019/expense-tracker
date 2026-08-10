import type { RecurringRule, Transaction } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { focusedTestDouble } from "../../test/mock-drizzle.js";
import { RecurringMaterializeService } from "../recurring-materialize.service.js";

const NOW = new Date("2026-07-01T00:00:00.000Z");
const RULE: RecurringRule = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  userId: "u1",
  template: {
    accountId: "223e4567-e89b-42d3-a456-426614174000",
    type: "expense",
    amountMinor: 5_000,
    description: "Rent",
    tags: []
  },
  rrule: "FREQ=DAILY;COUNT=1",
  startAt: NOW,
  nextRunAt: NOW,
  isPaused: false,
  autoPost: true,
  createdAt: NOW,
  updatedAt: NOW
};
const POSTED: Transaction = {
  id: "323e4567-e89b-42d3-a456-426614174000",
  userId: "u1",
  accountId: RULE.template.accountId,
  type: "expense",
  amountMinor: 5_000,
  currency: "INR",
  source: "recurring",
  status: "posted",
  paymentRail: "unknown",
  counterpartyHandle: null,
  occurredAt: NOW,
  description: "Rent",
  tags: [],
  createdAt: NOW,
  updatedAt: NOW
};

function createMaterializer(
  options: Readonly<{
    role?: "api" | "worker";
    rule?: RecurringRule;
    claimed?: boolean;
    applied?: boolean;
    transactionError?: Error;
  }>
) {
  const tx = {};
  const db = { transaction: vi.fn(async (work: (value: object) => Promise<unknown>) => work(tx)) };
  const rule = options.rule ?? RULE;
  const rules = {
    findDue: vi.fn().mockResolvedValue([rule]),
    claimRun: vi.fn().mockResolvedValue(options.claimed ?? true)
  };
  const accounts = {
    applyBalanceDelta: vi
      .fn()
      .mockResolvedValue(options.applied === false ? "account_not_found" : "applied")
  };
  const transactions = {
    create:
      options.transactionError === undefined
        ? vi.fn().mockResolvedValue(POSTED)
        : vi.fn().mockRejectedValue(options.transactionError)
  };
  const occurrences = {
    createExpected: vi.fn().mockResolvedValue({ id: "occ-1", recurringRuleId: rule.id })
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const logger = { log: vi.fn(), error: vi.fn() };
  const service = new RecurringMaterializeService(
    focusedTestDouble(db),
    focusedTestDouble({ env: { SERVICE_ROLE: options.role ?? "worker" } }),
    focusedTestDouble(rules),
    focusedTestDouble(accounts),
    focusedTestDouble(transactions),
    focusedTestDouble(occurrences),
    focusedTestDouble(audit),
    focusedTestDouble(logger)
  );
  return { service, rules, accounts, transactions, occurrences, audit, logger };
}

describe("RecurringMaterializeService edge coverage", () => {
  it("does nothing outside the worker process", async () => {
    const context = createMaterializer({ role: "api" });
    await context.service.materialize();
    expect(context.rules.findDue).not.toHaveBeenCalled();
  });

  it("skips a rule whose compare-and-swap claim was lost and pauses an exhausted rule", async () => {
    const context = createMaterializer({ claimed: false });
    await context.service.materialize();
    expect(context.rules.claimRun).toHaveBeenCalledWith(
      RULE.userId,
      RULE.id,
      RULE.nextRunAt,
      RULE.nextRunAt,
      true,
      expect.anything()
    );
    expect(context.transactions.create).not.toHaveBeenCalled();
    expect(context.logger.log).not.toHaveBeenCalled();
  });

  it("posts income with a positive delta and logs success", async () => {
    const incomeRule = {
      ...RULE,
      template: { ...RULE.template, type: "income" as const },
      rrule: "FREQ=DAILY;COUNT=2"
    };
    const context = createMaterializer({ rule: incomeRule });
    await context.service.materialize();
    expect(context.accounts.applyBalanceDelta).toHaveBeenCalledWith(
      "u1",
      RULE.template.accountId,
      5_000,
      expect.anything()
    );
    expect(context.logger.log).toHaveBeenCalled();
  });

  it("records an expected occurrence instead of posting a transaction for a manual-post rule", async () => {
    const manualRule = { ...RULE, autoPost: false };
    const context = createMaterializer({ rule: manualRule });
    await context.service.materialize();
    expect(context.occurrences.createExpected).toHaveBeenCalledWith(
      "u1",
      RULE.id,
      RULE.nextRunAt,
      expect.anything()
    );
    expect(context.transactions.create).not.toHaveBeenCalled();
    expect(context.accounts.applyBalanceDelta).not.toHaveBeenCalled();
    expect(context.logger.log).toHaveBeenCalled();
  });

  it("catches missing-account and transaction failures per rule", async () => {
    const missingAccount = createMaterializer({ applied: false });
    await missingAccount.service.materialize();
    expect(missingAccount.logger.error).toHaveBeenCalled();

    const failedPost = createMaterializer({ transactionError: new Error("failed") });
    await failedPost.service.materialize();
    expect(failedPost.logger.error).toHaveBeenCalled();
  });
});
