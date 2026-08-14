import type { Goal } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "../../auth/auth.guard.js";
import { GoalController } from "../goal.controller.js";

const GOAL_ID = "3fa85f64-5717-4562-b3fc-2c963f66beef";
const KEY = "10d11a9c-04ff-4e65-a22a-87b7f9681d98";
const USER: AuthenticatedUser = { id: "user-1" };
const GOAL: Goal = {
  id: GOAL_ID,
  userId: USER.id,
  name: "New Laptop",
  targetMinor: 150_000_00,
  fundingMode: "tagged",
  tag: "goal:laptop",
  priority: 0,
  status: "active",
  startedMinor: 0,
  progressMinor: 10_000_00,
  createdAt: new Date(),
  updatedAt: new Date()
};

function mockResponse() {
  const response = { status: vi.fn(), setHeader: vi.fn() };
  response.status.mockReturnValue(response);
  return response;
}

describe("GoalController", () => {
  it("validates and creates a goal through the idempotent mutation path", async () => {
    const service = { list: vi.fn() };
    const mutations = {
      create: vi.fn().mockResolvedValue({ result: GOAL, replayed: false })
    };
    // @ts-expect-error - focused controller unit test uses service doubles.
    const controller = new GoalController(service, mutations);
    const response = mockResponse();

    const result = await controller.create(
      USER,
      {
        name: "New Laptop",
        targetMinor: 150_000_00,
        fundingMode: "tagged",
        tag: "goal:laptop"
      },
      KEY,
      // @ts-expect-error - focused response double implements the methods used by the controller.
      response
    );

    expect(result).toEqual(GOAL);
    expect(mutations.create).toHaveBeenCalledWith(
      USER.id,
      {
        name: "New Laptop",
        targetMinor: 150_000_00,
        fundingMode: "tagged",
        tag: "goal:laptop"
      },
      KEY
    );
    expect(response.setHeader).toHaveBeenCalledWith("Location", `/api/v1/goals/${GOAL_ID}`);
  });

  it("defaults list filtering to active goals", async () => {
    const service = { list: vi.fn().mockResolvedValue([GOAL]) };
    // @ts-expect-error - focused controller unit test uses service doubles.
    const controller = new GoalController(service, {});

    await expect(controller.list(USER, {})).resolves.toEqual([GOAL]);
    expect(service.list).toHaveBeenCalledWith(USER.id, "active");
  });

  it("rejects attempts to change an immutable funding binding", async () => {
    const mutations = { update: vi.fn() };
    // @ts-expect-error - focused controller unit test uses service doubles.
    const controller = new GoalController({}, mutations);
    const response = mockResponse();

    await expect(
      controller.update(
        USER,
        GOAL_ID,
        { tag: "goal:other" },
        KEY,
        // @ts-expect-error - focused response double implements the methods used by the controller.
        response
      )
    ).rejects.toThrow();
    expect(mutations.update).not.toHaveBeenCalled();
  });

  it("marks replayed mutations in the response", async () => {
    const mutations = {
      update: vi.fn().mockResolvedValue({ result: GOAL, replayed: true })
    };
    // @ts-expect-error - focused controller unit test uses service doubles.
    const controller = new GoalController({}, mutations);
    const response = mockResponse();

    await controller.update(
      USER,
      GOAL_ID,
      { name: "Laptop Upgrade" },
      KEY,
      // @ts-expect-error - focused response double implements the methods used by the controller.
      response
    );

    expect(response.setHeader).toHaveBeenCalledWith("Idempotency-Replayed", "true");
  });

  it("records a contribution through the idempotent mutation path", async () => {
    const mutations = {
      recordContribution: vi.fn().mockResolvedValue({ result: GOAL, replayed: false })
    };
    // @ts-expect-error - focused controller unit test uses service doubles.
    const controller = new GoalController({}, mutations);
    const response = mockResponse();

    const result = await controller.recordContribution(
      USER,
      GOAL_ID,
      { type: "deposit", amountMinor: 5_000_00, note: "Cash deposit" },
      KEY,
      // @ts-expect-error - focused response double implements the methods used by the controller.
      response
    );

    expect(result).toEqual(GOAL);
    expect(mutations.recordContribution).toHaveBeenCalledWith(
      USER.id,
      GOAL_ID,
      { type: "deposit", amountMinor: 5_000_00, note: "Cash deposit" },
      KEY
    );
  });

  it("lists contributions for a goal", async () => {
    const contributions = [
      {
        id: "c-1",
        userId: USER.id,
        goalId: GOAL_ID,
        type: "deposit" as const,
        amountMinor: 5_000_00,
        occurredAt: new Date(),
        createdAt: new Date()
      }
    ];
    const service = { listContributions: vi.fn().mockResolvedValue(contributions) };
    // @ts-expect-error - focused controller unit test uses service doubles.
    const controller = new GoalController(service, {});

    const result = await controller.listContributions(USER, GOAL_ID);
    expect(result).toEqual(contributions);
    expect(service.listContributions).toHaveBeenCalledWith(USER.id, GOAL_ID);
  });
});
