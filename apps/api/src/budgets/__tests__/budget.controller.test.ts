import type { Budget, BudgetPage } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "../../auth/auth.guard.js";
import { BudgetController } from "../budget.controller.js";

const CATEGORY_ID = "3fa85f64-5717-4562-b3fc-2c963f66beef";
const BUDGET_ID = "10d11a9c-04ff-4e65-a22a-87b7f9681d98";
const KEY = "22222222-aaaa-4222-8222-222222222222";
const USER: AuthenticatedUser = { id: "user-1" };
const BUDGET: Budget = {
  id: BUDGET_ID,
  userId: USER.id,
  categoryId: CATEGORY_ID,
  limitMinor: 500_000_00,
  isArchived: false,
  createdAt: new Date(),
  updatedAt: new Date()
};
const EMPTY_PAGE: BudgetPage = {
  month: "2026-07",
  computedAt: new Date(),
  alertPolicy: { thresholdsBps: [8_000, 10_000] },
  overview: {
    plannedMinor: 0,
    spentInBudgetedCategoriesMinor: 0,
    remainingMinor: 0,
    unbudgetedSpentMinor: 0,
    activeBudgetCount: 0
  },
  items: [],
  pageInfo: { nextCursor: null, hasMore: false, limit: 50 }
};

function mockResponse() {
  const response = { status: vi.fn(), setHeader: vi.fn() };
  response.status.mockReturnValue(response);
  return response;
}

describe("BudgetController", () => {
  it("parses the query and lists budgets for the current user", async () => {
    const budgets = { list: vi.fn().mockResolvedValue(EMPTY_PAGE) };
    // @ts-expect-error - focused controller unit test uses service doubles.
    const controller = new BudgetController(budgets, {});

    await expect(controller.list(USER, {})).resolves.toBe(EMPTY_PAGE);
    expect(budgets.list).toHaveBeenCalledWith(USER.id, { limit: 50, includeArchived: false });
  });

  it("upserts a budget through the idempotent mutation path", async () => {
    const mutations = {
      upsert: vi.fn().mockResolvedValue({ result: BUDGET, replayed: false })
    };
    // @ts-expect-error - focused controller unit test uses service doubles.
    const controller = new BudgetController({}, mutations);
    const response = mockResponse();

    const result = await controller.upsert(
      USER,
      CATEGORY_ID,
      { limitMinor: 500_000_00 },
      KEY,
      // @ts-expect-error - focused response double implements the methods used by the controller.
      response
    );

    expect(result).toEqual(BUDGET);
    expect(mutations.upsert).toHaveBeenCalledWith(
      USER.id,
      CATEGORY_ID,
      { limitMinor: 500_000_00 },
      KEY
    );
    expect(response.status).not.toHaveBeenCalled();
  });

  it("marks a replayed upsert in the response", async () => {
    const mutations = {
      upsert: vi.fn().mockResolvedValue({ result: BUDGET, replayed: true })
    };
    // @ts-expect-error - focused controller unit test uses service doubles.
    const controller = new BudgetController({}, mutations);
    const response = mockResponse();

    await controller.upsert(
      USER,
      CATEGORY_ID,
      { limitMinor: 500_000_00 },
      KEY,
      // @ts-expect-error - focused response double implements the methods used by the controller.
      response
    );

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.setHeader).toHaveBeenCalledWith("Idempotency-Replayed", "true");
  });

  it("archives a budget and returns the archived configuration", async () => {
    const archived = { ...BUDGET, isArchived: true };
    const mutations = { archive: vi.fn().mockResolvedValue({ result: archived, replayed: false }) };
    // @ts-expect-error - focused controller unit test uses service doubles.
    const controller = new BudgetController({}, mutations);
    const response = mockResponse();

    const result = await controller.archive(
      USER,
      BUDGET_ID,
      KEY,
      // @ts-expect-error - focused response double implements the methods used by the controller.
      response
    );

    expect(result).toEqual(archived);
    expect(mutations.archive).toHaveBeenCalledWith(USER.id, BUDGET_ID, KEY);
  });

  it("rejects a malformed idempotency key before calling the mutation service", async () => {
    const mutations = { upsert: vi.fn() };
    // @ts-expect-error - focused controller unit test uses service doubles.
    const controller = new BudgetController({}, mutations);
    const response = mockResponse();

    await expect(
      controller.upsert(
        USER,
        CATEGORY_ID,
        { limitMinor: 500_000_00 },
        "not-a-uuid",
        // @ts-expect-error - focused response double implements the methods used by the controller.
        response
      )
    ).rejects.toThrow();
    expect(mutations.upsert).not.toHaveBeenCalled();
  });
});
