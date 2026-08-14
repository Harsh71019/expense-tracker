import type { Goal } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { GoalController } from "../goal.controller.js";

const GOAL_ID = "123e4567-e89b-42d3-a456-426614174000";
const KEY = "00000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-07-01T00:00:00.000Z");
const USER = { id: "u1" };
const GOAL: Goal = {
  id: GOAL_ID,
  userId: "u1",
  name: "Emergency",
  targetMinor: 100_000,
  fundingMode: "tagged",
  tag: "emergency",
  priority: 0,
  status: "active",
  startedMinor: 0,
  progressMinor: 10_000,
  createdAt: NOW,
  updatedAt: NOW
};

function response() {
  const value = { status: vi.fn(), setHeader: vi.fn() };
  value.status.mockReturnValue(value);
  return value;
}

describe("GoalController", () => {
  it("covers create replay and location response branches", async () => {
    const mutations = {
      create: vi
        .fn()
        .mockResolvedValueOnce({ result: GOAL, replayed: true })
        .mockResolvedValueOnce({ result: GOAL, replayed: false })
    };
    // @ts-expect-error - focused service doubles.
    const controller = new GoalController({}, mutations);
    const replay = response();
    const created = response();
    const body = {
      name: "Emergency",
      targetMinor: 100_000,
      fundingMode: "tagged",
      tag: "emergency"
    };

    await controller.create(
      USER,
      body,
      KEY,
      // @ts-expect-error - focused response double.
      replay
    );
    await controller.create(
      USER,
      body,
      KEY,
      // @ts-expect-error - focused response double.
      created
    );

    expect(replay.status).toHaveBeenCalledWith(200);
    expect(created.setHeader).toHaveBeenCalledWith("Location", `/api/v1/goals/${GOAL_ID}`);
  });

  it("lists, plans, and gets goals", async () => {
    const goals = {
      list: vi.fn().mockResolvedValue([GOAL]),
      getPlan: vi.fn().mockResolvedValue({ goalId: GOAL_ID }),
      get: vi.fn().mockResolvedValue(GOAL)
    };
    // @ts-expect-error - focused service doubles.
    const controller = new GoalController(goals, {});

    await expect(controller.list(USER, {})).resolves.toEqual([GOAL]);
    await expect(controller.plan(USER, GOAL_ID)).resolves.toEqual({ goalId: GOAL_ID });
    await expect(controller.get(USER, GOAL_ID)).resolves.toBe(GOAL);
  });

  it("covers replay headers for reorder, update, and abandon plus non-replay branches", async () => {
    const mutations = {
      reorder: vi
        .fn()
        .mockResolvedValueOnce({ result: null, replayed: true })
        .mockResolvedValueOnce({ result: null, replayed: false }),
      update: vi
        .fn()
        .mockResolvedValueOnce({ result: GOAL, replayed: true })
        .mockResolvedValueOnce({ result: GOAL, replayed: false }),
      abandon: vi
        .fn()
        .mockResolvedValueOnce({ result: null, replayed: true })
        .mockResolvedValueOnce({ result: null, replayed: false })
    };
    // @ts-expect-error - focused service doubles.
    const controller = new GoalController({}, mutations);

    for (const replayed of [true, false]) {
      const reorderResponse = response();
      const updateResponse = response();
      const abandonResponse = response();
      await controller.reorder(
        USER,
        { goalIds: [GOAL_ID] },
        KEY,
        // @ts-expect-error - focused response double.
        reorderResponse
      );
      await controller.update(
        USER,
        GOAL_ID,
        { name: "Updated" },
        KEY,
        // @ts-expect-error - focused response double.
        updateResponse
      );
      await controller.abandon(
        USER,
        GOAL_ID,
        KEY,
        // @ts-expect-error - focused response double.
        abandonResponse
      );
      expect(reorderResponse.setHeader).toHaveBeenCalledTimes(replayed ? 1 : 0);
      expect(updateResponse.setHeader).toHaveBeenCalledTimes(replayed ? 1 : 0);
      expect(abandonResponse.setHeader).toHaveBeenCalledTimes(replayed ? 1 : 0);
    }
  });

  it("covers replay headers for recordContribution", async () => {
    const mutations = {
      recordContribution: vi
        .fn()
        .mockResolvedValueOnce({ result: GOAL, replayed: true })
        .mockResolvedValueOnce({ result: GOAL, replayed: false })
    };
    // @ts-expect-error - focused service doubles.
    const controller = new GoalController({}, mutations);

    for (const replayed of [true, false]) {
      const res = response();
      await controller.recordContribution(
        USER,
        GOAL_ID,
        { type: "deposit", amountMinor: 5_000 },
        KEY,
        // @ts-expect-error - focused response double.
        res
      );
      expect(res.setHeader).toHaveBeenCalledTimes(replayed ? 1 : 0);
    }
  });
});
