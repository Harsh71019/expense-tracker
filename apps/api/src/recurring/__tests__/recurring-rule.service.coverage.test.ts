import type { CreateRecurringRule, RecurringRule } from "@treasury-ops/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CategoryKindMismatchError } from "../../common/errors/category-kind-mismatch.error.js";
import { EntityNotFoundError } from "../../common/errors/entity-not-found.error.js";
import { InvalidRecurringRuleError } from "../../common/errors/invalid-recurring-rule.error.js";
import { focusedTestDouble } from "../../test/mock-drizzle.js";
import { RecurringRuleMutationService } from "../recurring-rule-mutation.service.js";
import { RecurringRuleService } from "../recurring-rule.service.js";

const RULE_ID = "123e4567-e89b-42d3-a456-426614174000";
const ACCOUNT_ID = "223e4567-e89b-42d3-a456-426614174000";
const CATEGORY_ID = "323e4567-e89b-42d3-a456-426614174000";
const START = new Date("2026-07-01T00:00:00.000Z");
const INPUT: CreateRecurringRule = {
  template: {
    accountId: ACCOUNT_ID,
    type: "expense",
    amountMinor: 50_000,
    description: "Rent",
    tags: ["home"]
  },
  rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
  startAt: START,
  autoPost: true
};
const RULE: RecurringRule = {
  id: RULE_ID,
  userId: "u1",
  template: INPUT.template,
  rrule: INPUT.rrule,
  startAt: START,
  nextRunAt: START,
  isPaused: false,
  autoPost: true,
  createdAt: START,
  updatedAt: START
};

type Overrides = Readonly<{
  db?: unknown;
  rules?: unknown;
  accounts?: unknown;
  categories?: unknown;
}>;

function createService(overrides: Overrides = {}) {
  const tx = {};
  const collaborators = {
    db:
      overrides.db ??
      ({
        transaction: vi.fn(async (work: (value: object) => Promise<unknown>) => work(tx))
      } satisfies Record<string, unknown>),
    rules: overrides.rules ?? {},
    accounts: overrides.accounts ?? { exists: vi.fn().mockResolvedValue(true) },
    categories: overrides.categories ?? {}
  };
  const service = new RecurringRuleService(
    focusedTestDouble(collaborators.db),
    focusedTestDouble(collaborators.rules),
    focusedTestDouble(collaborators.accounts),
    focusedTestDouble(collaborators.categories)
  );
  return { service, tx, ...collaborators };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("RecurringRuleService create and list", () => {
  it("validates and creates a categorized recurring rule through the transaction wrapper", async () => {
    const input = { ...INPUT, template: { ...INPUT.template, categoryId: CATEGORY_ID } };
    const rules = { create: vi.fn().mockResolvedValue({ ...RULE, template: input.template }) };
    const categories = { findActiveById: vi.fn().mockResolvedValue({ kind: "expense" }) };
    const context = createService({ rules, categories });

    await expect(context.service.create("u1", input)).resolves.toMatchObject({ id: RULE_ID });
    expect(rules.create).toHaveBeenCalledWith("u1", input, START, context.tx);
  });

  it("rejects a missing or mismatched category", async () => {
    const input = { ...INPUT, template: { ...INPUT.template, categoryId: CATEGORY_ID } };
    for (const category of [null, { kind: "income" }]) {
      const context = createService({
        categories: { findActiveById: vi.fn().mockResolvedValue(category) }
      });
      await expect(
        context.service.createInTxn(
          "u1",
          input,
          // @ts-expect-error - focused transaction double.
          context.tx
        )
      ).rejects.toBeInstanceOf(category === null ? EntityNotFoundError : CategoryKindMismatchError);
    }
  });

  it("rejects an exhausted recurrence and lists stored rules", async () => {
    const exhausted = createService();
    await expect(
      exhausted.service.createInTxn(
        "u1",
        { ...INPUT, rrule: "FREQ=DAILY;COUNT=1;UNTIL=20260101T000000Z" },
        // @ts-expect-error - focused transaction double.
        exhausted.tx
      )
    ).rejects.toBeInstanceOf(InvalidRecurringRuleError);

    const listed = createService({ rules: { list: vi.fn().mockResolvedValue([RULE]) } });
    await expect(listed.service.list("u1")).resolves.toEqual([RULE]);
  });
});

describe("RecurringRuleService update", () => {
  it("updates account, category, type, and recurrence through the wrapper", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T00:00:00.000Z"));
    const patch = {
      template: {
        accountId: ACCOUNT_ID,
        categoryId: CATEGORY_ID,
        type: "expense" as const
      },
      rrule: "FREQ=MONTHLY;BYMONTHDAY=20"
    };
    const updated = { ...RULE, nextRunAt: new Date("2026-07-20T00:00:00.000Z") };
    const rules = {
      findById: vi.fn().mockResolvedValue(RULE),
      update: vi.fn().mockResolvedValue(updated)
    };
    const accounts = { exists: vi.fn().mockResolvedValue(true) };
    const categories = { findActiveById: vi.fn().mockResolvedValue({ kind: "expense" }) };
    const context = createService({ rules, accounts, categories });

    await expect(context.service.update("u1", RULE_ID, patch)).resolves.toBe(updated);
    expect(rules.update).toHaveBeenCalledWith(
      "u1",
      RULE_ID,
      patch,
      new Date("2026-07-20T00:00:00.000Z"),
      context.tx
    );
  });

  it("uses current category and type when a template patch omits them", async () => {
    const categorized = {
      ...RULE,
      template: { ...RULE.template, categoryId: CATEGORY_ID }
    };
    const rules = {
      findById: vi.fn().mockResolvedValue(categorized),
      update: vi.fn().mockResolvedValue(categorized)
    };
    const categories = { findActiveById: vi.fn().mockResolvedValue({ kind: "expense" }) };
    const context = createService({ rules, categories });

    await expect(
      context.service.updateInTxn(
        "u1",
        RULE_ID,
        { template: { description: "New rent" } },
        // @ts-expect-error - focused transaction double.
        context.tx
      )
    ).resolves.toBe(categorized);
    expect(rules.update).toHaveBeenCalledWith(
      "u1",
      RULE_ID,
      expect.anything(),
      undefined,
      context.tx
    );
  });

  it("rejects a missing rule, account, category, category mismatch, exhausted recurrence, and lost update", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T00:00:00.000Z"));
    const scenarios = [
      {
        expected: EntityNotFoundError,
        patch: { isPaused: true },
        rules: { findById: vi.fn().mockResolvedValue(null) },
        accounts: {},
        categories: {}
      },
      {
        expected: EntityNotFoundError,
        patch: { template: { accountId: ACCOUNT_ID } },
        rules: { findById: vi.fn().mockResolvedValue(RULE) },
        accounts: { exists: vi.fn().mockResolvedValue(false) },
        categories: {}
      },
      {
        expected: EntityNotFoundError,
        patch: { template: { categoryId: CATEGORY_ID } },
        rules: { findById: vi.fn().mockResolvedValue(RULE) },
        accounts: {},
        categories: { findActiveById: vi.fn().mockResolvedValue(null) }
      },
      {
        expected: CategoryKindMismatchError,
        patch: { template: { categoryId: CATEGORY_ID } },
        rules: { findById: vi.fn().mockResolvedValue(RULE) },
        accounts: {},
        categories: { findActiveById: vi.fn().mockResolvedValue({ kind: "income" }) }
      },
      {
        expected: InvalidRecurringRuleError,
        patch: { rrule: "FREQ=DAILY;COUNT=1" },
        rules: { findById: vi.fn().mockResolvedValue(RULE) },
        accounts: {},
        categories: {}
      },
      {
        expected: EntityNotFoundError,
        patch: { isPaused: true },
        rules: {
          findById: vi.fn().mockResolvedValue(RULE),
          update: vi.fn().mockResolvedValue(null)
        },
        accounts: {},
        categories: {}
      }
    ];

    for (const scenario of scenarios) {
      const context = createService({
        rules: scenario.rules,
        accounts: scenario.accounts,
        categories: scenario.categories
      });
      await expect(
        context.service.updateInTxn(
          "u1",
          RULE_ID,
          scenario.patch,
          // @ts-expect-error - focused transaction double.
          context.tx
        )
      ).rejects.toBeInstanceOf(scenario.expected);
    }
  });
});

describe("RecurringRuleMutationService", () => {
  it("executes create and update callbacks through idempotency", async () => {
    const rules = {
      createInTxn: vi.fn().mockResolvedValue(RULE),
      updateInTxn: vi.fn().mockResolvedValue(RULE)
    };
    const tx = {};
    const idempotency = {
      execute: vi.fn(
        async (
          _userId: string,
          _operation: string,
          _key: string,
          _intent: unknown,
          _schema: unknown,
          work: (value: object) => Promise<RecurringRule>
        ) => ({ result: await work(tx), replayed: false })
      )
    };
    // @ts-expect-error - focused collaborators implement both exercised methods.
    const service = new RecurringRuleMutationService(rules, idempotency);

    await service.create("u1", INPUT, "key-1");
    await service.update("u1", RULE_ID, { isPaused: true }, "key-2");

    expect(rules.createInTxn).toHaveBeenCalledWith("u1", INPUT, tx);
    expect(rules.updateInTxn).toHaveBeenCalledWith("u1", RULE_ID, { isPaused: true }, tx);
  });
});
