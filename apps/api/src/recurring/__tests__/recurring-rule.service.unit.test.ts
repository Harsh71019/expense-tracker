import { describe, expect, it, vi } from "vitest";

import type { AccountRepository } from "../../accounts/account.repository.js";
import type { CategoryRepository } from "../../categories/category.repository.js";
import type { DrizzleDb } from "../../common/db/db.module.js";
import { EntityNotFoundError } from "../../common/errors/entity-not-found.error.js";
import type { RecurringRuleRepository } from "../recurring-rule.repository.js";
import { RecurringRuleService } from "../recurring-rule.service.js";

describe("RecurringRuleService Unit Tests", () => {
  const sampleRule = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    userId: "u1",
    template: {
      accountId: "123e4567-e89b-12d3-a456-426614174001",
      type: "expense" as const,
      amountMinor: 2500000,
      description: "Monthly Rent",
      tags: ["housing"]
    },
    rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
    startAt: new Date("2026-01-01"),
    nextRunAt: new Date("2026-01-01"),
    endAt: null,
    isPaused: false,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const createService = (opts: {
    mockDb?: unknown;
    mockRuleRepo?: unknown;
    mockAccountRepo?: unknown;
    mockCategoryRepo?: unknown;
  }) => {
    // @ts-expect-error mock db
    const db: DrizzleDb = opts.mockDb ?? {
      transaction: vi.fn(async (cb: (tx: string) => Promise<unknown>) => cb("tx1"))
    };
    // @ts-expect-error mock rule repo
    const ruleRepo: RecurringRuleRepository = opts.mockRuleRepo ?? {};
    // @ts-expect-error mock account repo
    const accountRepo: AccountRepository = opts.mockAccountRepo ?? {};
    // @ts-expect-error mock category repo
    const categoryRepo: CategoryRepository = opts.mockCategoryRepo ?? {};

    return new RecurringRuleService(db, ruleRepo, accountRepo, categoryRepo);
  };

  it("create validates account and creates rule", async () => {
    const mockRuleRepo = { create: vi.fn(async () => sampleRule) };
    const mockAccountRepo = { exists: vi.fn(async () => true) };

    const service = createService({ mockRuleRepo, mockAccountRepo });
    const res = await service.create("u1", {
      template: {
        accountId: "123e4567-e89b-12d3-a456-426614174001",
        type: "expense",
        amountMinor: 2500000,
        description: "Monthly Rent",
        tags: ["housing"]
      },
      rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
      startAt: new Date("2026-01-01"),
      autoPost: true
    });

    expect(res.id).toBe(sampleRule.id);
  });

  it("create throws EntityNotFoundError if account does not exist", async () => {
    const mockAccountRepo = { exists: vi.fn(async () => false) };

    const service = createService({ mockAccountRepo });
    await expect(
      service.create("u1", {
        template: {
          accountId: "123e4567-e89b-12d3-a456-426614174001",
          type: "expense",
          amountMinor: 2500000,
          description: "Monthly Rent",
          tags: ["housing"]
        },
        rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
        startAt: new Date("2026-01-01"),
        autoPost: true
      })
    ).rejects.toThrow(EntityNotFoundError);
  });
});
