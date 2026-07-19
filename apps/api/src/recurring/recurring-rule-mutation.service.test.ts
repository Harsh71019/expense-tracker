import { describe, expect, it, vi } from "vitest";

import { RecurringRuleMutationService } from "./recurring-rule-mutation.service.js";

describe("RecurringRuleMutationService", () => {
  it("records create and update through the idempotency service", async () => {
    const rules = { createInTxn: vi.fn(), updateInTxn: vi.fn() };
    const idempotency = {
      execute: vi.fn().mockResolvedValue({ result: { id: "rule-1" }, replayed: false })
    };
    // @ts-expect-error - focused service mocks for unit testing
    const service = new RecurringRuleMutationService(rules, idempotency);
    const input = {
      template: {
        accountId: "3fa85f64-5717-4562-b3fc-2c963f66beef",
        type: "expense" as const,
        amountMinor: 50_000,
        description: "Internet",
        tags: []
      },
      rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
      startAt: new Date("2026-07-19T00:00:00.000Z")
    };

    await service.create("user-1", input, "key-1");
    await service.update(
      "user-1",
      "3fa85f64-5717-4562-b3fc-2c963f66bef0",
      { isPaused: true },
      "key-2"
    );

    expect(idempotency.execute).toHaveBeenNthCalledWith(
      1,
      "user-1",
      "recurring-rule.create",
      "key-1",
      expect.anything(),
      expect.any(Function)
    );
    expect(idempotency.execute).toHaveBeenNthCalledWith(
      2,
      "user-1",
      "recurring-rule.update",
      "key-2",
      expect.anything(),
      expect.any(Function)
    );
  });
});
