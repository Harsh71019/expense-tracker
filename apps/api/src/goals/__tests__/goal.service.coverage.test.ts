import type { Goal, StoredGoal } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { EntityNotFoundError } from "../../common/errors/entity-not-found.error.js";
import { GoalFundingSourceInUseError } from "../../common/errors/goal-funding-source-in-use.error.js";
import { InvalidGoalOrderError } from "../../common/errors/invalid-goal-order.error.js";
import { focusedTestDouble } from "../../test/mock-drizzle.js";
import { GoalMutationService } from "../goal-mutation.service.js";
import { GoalService } from "../goal.service.js";

const GOAL_ID = "123e4567-e89b-42d3-a456-426614174000";
const SECOND_GOAL_ID = "223e4567-e89b-42d3-a456-426614174000";
const ACCOUNT_ID = "323e4567-e89b-42d3-a456-426614174000";
const NOW = new Date("2026-07-01T00:00:00.000Z");
const TAGGED_GOAL: StoredGoal = {
  id: GOAL_ID,
  userId: "u1",
  name: "Emergency fund",
  targetMinor: 100_000,
  fundingMode: "tagged",
  tag: "emergency",
  priority: 0,
  status: "active",
  startedMinor: 0,
  createdAt: NOW,
  updatedAt: NOW
};
const LINKED_GOAL: StoredGoal = {
  ...TAGGED_GOAL,
  fundingMode: "linked_account",
  tag: undefined,
  linkedAccountId: ACCOUNT_ID,
  startedMinor: 20_000
};

type Double = Readonly<Record<string, ReturnType<typeof vi.fn>>>;
type Overrides = Readonly<{
  db?: Double;
  goals?: Double;
  accounts?: Double;
  audit?: Double;
}>;

function createService(overrides: Overrides = {}) {
  const tx = {};
  const collaborators = {
    db:
      overrides.db ??
      ({
        transaction: vi.fn(async (work: (value: object) => Promise<unknown>) => work(tx))
      } satisfies Record<string, unknown>),
    goals:
      overrides.goals ??
      ({
        sumTaggedContributions: vi.fn().mockResolvedValue(25_000)
      } satisfies Record<string, unknown>),
    accounts: overrides.accounts ?? {},
    audit: overrides.audit ?? { record: vi.fn().mockResolvedValue(undefined) }
  };
  const service = new GoalService(
    focusedTestDouble(collaborators.db),
    focusedTestDouble(collaborators.goals),
    focusedTestDouble(collaborators.accounts),
    focusedTestDouble(collaborators.audit)
  );
  return { service, tx, ...collaborators };
}

describe("GoalService create and reads", () => {
  it("creates tagged goals through the transaction wrapper", async () => {
    const goals = {
      nextPriority: vi.fn().mockResolvedValue(2),
      create: vi.fn().mockResolvedValue(TAGGED_GOAL),
      sumTaggedContributions: vi.fn().mockResolvedValue(25_000)
    };
    const context = createService({ goals });

    await expect(
      context.service.create("u1", {
        name: "Emergency fund",
        targetMinor: 100_000,
        fundingMode: "tagged",
        tag: "emergency"
      })
    ).resolves.toMatchObject({ id: GOAL_ID, progressMinor: 25_000 });
    expect(goals.create).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ fundingMode: "tagged" }),
      0,
      2,
      context.tx
    );
  });

  it("initializes linked-account goals from an active account balance", async () => {
    const goals = {
      nextPriority: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue(LINKED_GOAL)
    };
    const accounts = {
      findById: vi
        .fn()
        .mockResolvedValueOnce({ id: ACCOUNT_ID, balanceMinor: 20_000, isArchived: false })
        .mockResolvedValueOnce({ id: ACCOUNT_ID, balanceMinor: 45_000, isArchived: false })
    };
    const context = createService({ goals, accounts });

    await expect(
      context.service.createInTx(
        "u1",
        {
          name: "House",
          targetMinor: 100_000,
          fundingMode: "linked_account",
          linkedAccountId: ACCOUNT_ID
        },
        focusedTestDouble(context.tx)
      )
    ).resolves.toMatchObject({ progressMinor: 25_000 });
    expect(goals.create).toHaveBeenCalledWith("u1", expect.anything(), 20_000, 0, context.tx);
  });

  it("rejects missing and archived linked accounts", async () => {
    for (const account of [null, { id: ACCOUNT_ID, balanceMinor: 0, isArchived: true }]) {
      const context = createService({ accounts: { findById: vi.fn().mockResolvedValue(account) } });
      await expect(
        context.service.createInTx(
          "u1",
          {
            name: "House",
            targetMinor: 100_000,
            fundingMode: "linked_account",
            linkedAccountId: ACCOUNT_ID
          },
          // @ts-expect-error - focused transaction double.
          context.tx
        )
      ).rejects.toBeInstanceOf(EntityNotFoundError);
    }
  });

  it("maps funding-source constraint failures and rethrows unrelated errors", async () => {
    const duplicate = createService({
      goals: {
        nextPriority: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockRejectedValue({
          cause: { constraint: "goals_user_id_tag_unique" }
        })
      }
    });
    await expect(
      duplicate.service.createInTx(
        "u1",
        {
          name: "Emergency",
          targetMinor: 100,
          fundingMode: "tagged",
          tag: "emergency"
        },
        // @ts-expect-error - focused transaction double.
        duplicate.tx
      )
    ).rejects.toBeInstanceOf(GoalFundingSourceInUseError);

    const failure = new Error("database unavailable");
    const unrelated = createService({
      goals: {
        nextPriority: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockRejectedValue(failure)
      }
    });
    await expect(
      unrelated.service.createInTx(
        "u1",
        { name: "Emergency", targetMinor: 100, fundingMode: "tagged", tag: "emergency" },
        // @ts-expect-error - focused transaction double.
        unrelated.tx
      )
    ).rejects.toBe(failure);
  });

  it("lists goals with progress and gets one goal", async () => {
    const goals = {
      list: vi.fn().mockResolvedValue([TAGGED_GOAL, { ...TAGGED_GOAL, id: SECOND_GOAL_ID }]),
      findById: vi.fn().mockResolvedValue(TAGGED_GOAL),
      sumTaggedContributions: vi.fn().mockResolvedValue(30_000)
    };
    const context = createService({ goals });

    await expect(context.service.list("u1", "active")).resolves.toEqual([
      expect.objectContaining({ id: GOAL_ID, progressMinor: 30_000 }),
      expect.objectContaining({ id: SECOND_GOAL_ID, progressMinor: 30_000 })
    ]);
    await expect(context.service.get("u1", GOAL_ID)).resolves.toMatchObject({
      progressMinor: 30_000
    });
  });

  it("rejects a missing goal from get", async () => {
    const context = createService({ goals: { findById: vi.fn().mockResolvedValue(null) } });
    await expect(context.service.get("u1", GOAL_ID)).rejects.toBeInstanceOf(EntityNotFoundError);
  });
});

describe("GoalService mutations", () => {
  it("updates through the public wrapper and audits before and after values", async () => {
    const after = { ...TAGGED_GOAL, name: "Updated", targetDate: NOW };
    const goals = {
      findById: vi.fn().mockResolvedValue(TAGGED_GOAL),
      update: vi.fn().mockResolvedValue(after),
      sumTaggedContributions: vi.fn().mockResolvedValue(40_000)
    };
    const context = createService({ goals });

    await expect(context.service.update("u1", GOAL_ID, { name: "Updated" })).resolves.toMatchObject(
      { name: "Updated", progressMinor: 40_000 }
    );
    expect(context.audit.record).toHaveBeenCalledWith("u1", "goal.update", GOAL_ID, context.tx, {
      before: {
        name: TAGGED_GOAL.name,
        targetMinor: TAGGED_GOAL.targetMinor,
        targetDate: TAGGED_GOAL.targetDate
      },
      after: {
        name: "Updated",
        targetMinor: TAGGED_GOAL.targetMinor,
        targetDate: NOW
      }
    });
  });

  it("rejects missing goals before and after an update", async () => {
    const missingBefore = createService({
      goals: { findById: vi.fn().mockResolvedValue(null) }
    });
    await expect(
      missingBefore.service.updateInTx(
        "u1",
        GOAL_ID,
        { name: "Updated" },
        // @ts-expect-error - focused transaction double.
        missingBefore.tx
      )
    ).rejects.toBeInstanceOf(EntityNotFoundError);

    const missingAfter = createService({
      goals: {
        findById: vi.fn().mockResolvedValue(TAGGED_GOAL),
        update: vi.fn().mockResolvedValue(null)
      }
    });
    await expect(
      missingAfter.service.updateInTx(
        "u1",
        GOAL_ID,
        { name: "Updated" },
        // @ts-expect-error - focused transaction double.
        missingAfter.tx
      )
    ).rejects.toBeInstanceOf(EntityNotFoundError);
  });

  it("abandons through the wrapper and rejects a failed conditional update", async () => {
    const success = createService({
      goals: { abandon: vi.fn().mockResolvedValue(true) }
    });
    await expect(success.service.abandon("u1", GOAL_ID)).resolves.toBeUndefined();
    expect(success.audit.record).toHaveBeenCalledWith("u1", "goal.abandon", GOAL_ID, success.tx);

    const missing = createService({
      goals: { abandon: vi.fn().mockResolvedValue(false) }
    });
    await expect(
      missing.service.abandonInTx(
        "u1",
        GOAL_ID,
        // @ts-expect-error - focused transaction double.
        missing.tx
      )
    ).rejects.toBeInstanceOf(EntityNotFoundError);
  });

  it("reorders all active goals through the transaction wrapper", async () => {
    const goals = {
      lockOrdering: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([TAGGED_GOAL, { ...TAGGED_GOAL, id: SECOND_GOAL_ID }]),
      setPriority: vi.fn().mockResolvedValue(true)
    };
    const context = createService({ goals });

    await expect(
      context.service.reorder("u1", { goalIds: [SECOND_GOAL_ID, GOAL_ID] })
    ).resolves.toBeUndefined();
    expect(goals.setPriority).toHaveBeenNthCalledWith(1, "u1", SECOND_GOAL_ID, 0, context.tx);
    expect(goals.setPriority).toHaveBeenNthCalledWith(2, "u1", GOAL_ID, 1, context.tx);
  });

  it("rejects reorder sets with a different size or unknown id", async () => {
    const sizeMismatch = createService({
      goals: {
        lockOrdering: vi.fn(),
        list: vi.fn().mockResolvedValue([TAGGED_GOAL])
      }
    });
    await expect(
      sizeMismatch.service.reorderInTx(
        "u1",
        { goalIds: [] },
        // @ts-expect-error - focused transaction double.
        sizeMismatch.tx
      )
    ).rejects.toBeInstanceOf(InvalidGoalOrderError);

    const unknown = createService({
      goals: {
        lockOrdering: vi.fn(),
        list: vi.fn().mockResolvedValue([TAGGED_GOAL])
      }
    });
    await expect(
      unknown.service.reorderInTx(
        "u1",
        { goalIds: [SECOND_GOAL_ID] },
        // @ts-expect-error - focused transaction double.
        unknown.tx
      )
    ).rejects.toBeInstanceOf(InvalidGoalOrderError);
  });

  it("rejects a goal that disappears while priorities are updated", async () => {
    const context = createService({
      goals: {
        lockOrdering: vi.fn(),
        list: vi.fn().mockResolvedValue([TAGGED_GOAL]),
        setPriority: vi.fn().mockResolvedValue(false)
      }
    });

    await expect(
      context.service.reorderInTx(
        "u1",
        { goalIds: [GOAL_ID] },
        // @ts-expect-error - focused transaction double.
        context.tx
      )
    ).rejects.toBeInstanceOf(EntityNotFoundError);
  });
});

describe("GoalService progress and plans", () => {
  it("gets a deterministic plan for a goal", async () => {
    const context = createService({
      goals: {
        findById: vi.fn().mockResolvedValue({ ...TAGGED_GOAL, targetDate: new Date("2026-09-01") }),
        sumTaggedContributions: vi.fn().mockResolvedValue(40_000)
      }
    });

    await expect(context.service.getPlan("u1", GOAL_ID, NOW)).resolves.toMatchObject({
      goalId: GOAL_ID,
      mode: "target_date"
    });
  });

  it("computes linked-account progress and rejects missing funding metadata", async () => {
    const linked = createService({
      accounts: { findById: vi.fn().mockResolvedValue({ balanceMinor: 45_000 }) }
    });
    await expect(linked.service.getProgress("u1", LINKED_GOAL)).resolves.toBe(25_000);

    await expect(
      linked.service.getProgress("u1", { ...TAGGED_GOAL, tag: undefined })
    ).rejects.toThrow("missing its tag");
    await expect(
      linked.service.getProgress("u1", { ...LINKED_GOAL, linkedAccountId: undefined })
    ).rejects.toThrow("missing its account");
  });

  it("rejects a linked goal whose account no longer exists", async () => {
    const context = createService({
      accounts: { findById: vi.fn().mockResolvedValue(null) }
    });
    await expect(context.service.getProgress("u1", LINKED_GOAL)).rejects.toBeInstanceOf(
      EntityNotFoundError
    );
  });
});

describe("GoalMutationService", () => {
  it("executes create, update, abandon, and reorder callbacks", async () => {
    const goalWithProgress: Goal = { ...TAGGED_GOAL, progressMinor: 25_000 };
    const goals = {
      createInTx: vi.fn().mockResolvedValue(goalWithProgress),
      updateInTx: vi.fn().mockResolvedValue(goalWithProgress),
      abandonInTx: vi.fn().mockResolvedValue(null),
      reorderInTx: vi.fn().mockResolvedValue(null)
    };
    const tx = {};
    const idempotency = {
      execute: vi.fn(
        async (
          _userId: string,
          _operation: string,
          _key: string,
          _schema: unknown,
          work: (value: object) => Promise<unknown>
        ) => ({ result: await work(tx), replayed: false })
      )
    };
    // @ts-expect-error - focused collaborators implement every exercised method.
    const service = new GoalMutationService(goals, idempotency);

    await service.create(
      "u1",
      { name: "Emergency", targetMinor: 100_000, fundingMode: "tagged", tag: "emergency" },
      "key-1"
    );
    await service.update("u1", GOAL_ID, { name: "Updated" }, "key-2");
    await service.abandon("u1", GOAL_ID, "key-3");
    await service.reorder("u1", { goalIds: [GOAL_ID] }, "key-4");

    expect(goals.createInTx).toHaveBeenCalledWith("u1", expect.anything(), tx);
    expect(goals.updateInTx).toHaveBeenCalledWith("u1", GOAL_ID, { name: "Updated" }, tx);
    expect(goals.abandonInTx).toHaveBeenCalledWith("u1", GOAL_ID, tx);
    expect(goals.reorderInTx).toHaveBeenCalledWith("u1", { goalIds: [GOAL_ID] }, tx);
  });
});
