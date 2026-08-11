import { describe, expect, it, vi } from "vitest";

import { createMockConfig } from "../../test/mock-config.js";
import { RecurringMaterializeService } from "../recurring-materialize.service.js";

describe("Recurring Materialization Unit Tests", () => {
  const sampleRule = {
    id: "rule_1",
    userId: "u1",
    template: {
      accountId: "123e4567-e89b-12d3-a456-426614174000",
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
    autoPost: true,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  it("materialize processes due rules on worker role", async () => {
    const mockDb = {
      transaction: vi.fn(async (cb: (tx: string) => Promise<unknown>) => cb("tx1"))
    };
    const mockConfig = createMockConfig("worker");
    const mockRuleRepo = {
      findDue: vi.fn(async () => [sampleRule]),
      claimRun: vi.fn(async () => true)
    };
    const mockAccountRepo = {
      applyBalanceDelta: vi.fn(async () => "applied")
    };
    const mockTxRepo = {
      create: vi.fn(async () => ({
        id: "tx_1",
        userId: "u1",
        accountId: "acc_1",
        type: "expense" as const,
        amountMinor: 2500000,
        occurredAt: new Date(),
        description: "Monthly Rent",
        tags: ["housing"],
        currency: "INR" as const,
        source: "recurring" as const,
        status: "posted" as const,
        createdAt: new Date(),
        updatedAt: new Date()
      }))
    };
    const mockOccurrenceRepo = {
      createExpected: vi.fn(async () => ({ id: "occ_1" }))
    };
    const mockAuditRepo = {
      record: vi.fn(async () => undefined)
    };
    const mockLogger = { log: vi.fn(), error: vi.fn() };

    const service = new RecurringMaterializeService(
      // @ts-expect-error mock service args
      mockDb,
      mockConfig,
      mockRuleRepo,
      mockAccountRepo,
      mockTxRepo,
      mockOccurrenceRepo,
      mockAuditRepo,
      mockLogger
    );
    await service.materialize();

    expect(mockRuleRepo.findDue).toHaveBeenCalled();
    expect(mockRuleRepo.claimRun).toHaveBeenCalled();
    expect(mockTxRepo.create).toHaveBeenCalled();
  });
});
