import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { describe, expect, it, vi } from "vitest";

import { RecurringRuleController } from "./recurring-rule.controller.js";

const user: AuthenticatedUser = { id: "user-1" };
const timestamp = new Date("2026-07-19T00:00:00.000Z");
const rule = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66bef0",
  userId: user.id,
  template: {
    accountId: "3fa85f64-5717-4562-b3fc-2c963f66beef",
    type: "expense" as const,
    amountMinor: 50_000,
    description: "Internet",
    tags: []
  },
  rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
  startAt: timestamp,
  nextRunAt: timestamp,
  isPaused: false,
  createdAt: timestamp,
  updatedAt: timestamp
};

describe("RecurringRuleController", () => {
  it("lists rules through the read service", async () => {
    const service = { list: vi.fn().mockResolvedValue([rule]) };
    const mutations = { create: vi.fn(), update: vi.fn() };
    // @ts-expect-error - focused service mocks for unit testing
    const controller = new RecurringRuleController(service, mutations);
    await expect(controller.list(user)).resolves.toEqual([rule]);
    expect(service.list).toHaveBeenCalledWith(user.id);
  });

  it("creates and updates with required idempotency keys", async () => {
    const service = { list: vi.fn() };
    const mutations = {
      create: vi.fn().mockResolvedValue({ result: rule, replayed: true }),
      update: vi.fn().mockResolvedValue({ result: { ...rule, isPaused: true }, replayed: true })
    };
    // @ts-expect-error - focused service mocks for unit testing
    const controller = new RecurringRuleController(service, mutations);
    const response = { status: vi.fn(), setHeader: vi.fn() };
    response.status.mockReturnValue(response);
    const key = "11111111-1111-4111-8111-111111111111";

    await controller.create(
      user,
      { template: rule.template, rrule: rule.rrule, startAt: timestamp },
      key,
      // @ts-expect-error - mock Response for unit testing
      response
    );
    await controller.update(
      user,
      rule.id,
      { isPaused: true },
      key,
      // @ts-expect-error - mock Response for unit testing
      response
    );

    expect(mutations.create).toHaveBeenCalledWith(
      user.id,
      { template: rule.template, rrule: rule.rrule, startAt: timestamp },
      key
    );
    expect(mutations.update).toHaveBeenCalledWith(user.id, rule.id, { isPaused: true }, key);
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.setHeader).toHaveBeenCalledWith("Idempotency-Replayed", "true");
  });

  it("rejects a missing idempotency key before mutation", async () => {
    const service = { list: vi.fn() };
    const mutations = { create: vi.fn(), update: vi.fn() };
    // @ts-expect-error - focused service mocks for unit testing
    const controller = new RecurringRuleController(service, mutations);
    await expect(
      controller.create(user, { template: rule.template, rrule: rule.rrule, startAt: timestamp })
    ).rejects.toThrow();
    expect(mutations.create).not.toHaveBeenCalled();
  });
});
