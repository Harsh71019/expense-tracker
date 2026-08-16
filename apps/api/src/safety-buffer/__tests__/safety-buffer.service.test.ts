import { beforeEach, describe, expect, it, vi } from "vitest";

import { EntityNotFoundError } from "../../common/errors/entity-not-found.error.js";
import { focusedTestDouble } from "../../test/mock-drizzle.js";
import { SafetyBufferService } from "../safety-buffer.service.js";
import type { AccountRepository } from "../../accounts/account.repository.js";
import type { AuditRepository } from "../../audit/audit.repository.js";
import type { DrizzleDb } from "../../common/db/db.module.js";
import type { DbTx } from "../../common/db/db-txn.js";
import type { IdempotencyPostgresService } from "../../common/idempotency/idempotency-postgres.service.js";
import type { ForecastingRepository } from "../../insights/forecasting/forecasting.repository.js";
import type { SafetyBufferRepository } from "../safety-buffer.repository.js";

describe("SafetyBufferService", () => {
  let service: SafetyBufferService;
  let mockDb: Record<string, unknown>;
  let mockRepository: {
    findEffective: ReturnType<typeof vi.fn>;
    findLatestVersion: ReturnType<typeof vi.fn>;
    createVersion: ReturnType<typeof vi.fn>;
    findGoal: ReturnType<typeof vi.fn>;
    listVersions: ReturnType<typeof vi.fn>;
  };
  let mockAudit: {
    record: ReturnType<typeof vi.fn>;
  };
  let mockAccounts: {
    list: ReturnType<typeof vi.fn>;
  };
  let mockForecasting: {
    findInputs: ReturnType<typeof vi.fn>;
  };
  let mockIdempotency: {
    execute: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockDb = {};
    mockRepository = {
      findEffective: vi.fn(),
      findLatestVersion: vi.fn(),
      createVersion: vi.fn(),
      findGoal: vi.fn(),
      listVersions: vi.fn()
    };
    mockAudit = {
      record: vi.fn().mockResolvedValue(undefined)
    };
    mockAccounts = {
      list: vi.fn().mockResolvedValue([
        { id: "acc-1", balanceMinor: 5_000_000, type: "bank", isArchived: false },
        { id: "acc-2", balanceMinor: 2_000_000, type: "cash", isArchived: false },
        { id: "acc-3", balanceMinor: 10_000_000, type: "investment", isArchived: false },
        { id: "acc-4", balanceMinor: -1_000_000, type: "credit_card", isArchived: false }
      ])
    };
    mockForecasting = {
      findInputs: vi.fn().mockResolvedValue({
        knownStreams: [
          { transactionType: "expense", amountMinor: 2_000_000 },
          { transactionType: "income", amountMinor: 5_000_000 }
        ],
        billsDue: [{ amountDueMinor: 1_000_000 }]
      })
    };
    mockIdempotency = {
      execute: vi.fn(async (_userId, _action, _key, _payload, _schema, handler) => {
        const tx = focusedTestDouble<DbTx>({});
        const res = await handler(tx);
        return { replayed: false, result: res };
      })
    };

    service = new SafetyBufferService(
      focusedTestDouble<DrizzleDb>(mockDb),
      focusedTestDouble<SafetyBufferRepository>(mockRepository),
      focusedTestDouble<AuditRepository>(mockAudit),
      focusedTestDouble<AccountRepository>(mockAccounts),
      focusedTestDouble<ForecastingRepository>(mockForecasting),
      focusedTestDouble<IdempotencyPostgresService>(mockIdempotency)
    );
  });

  describe("getState", () => {
    it("returns default fallback policy when no preference is configured", async () => {
      mockRepository.findEffective.mockResolvedValue(null);

      const state = await service.getState("user-1");

      expect(state.isFallback).toBe(true);
      expect(state.fallbackPolicy).toBe("default_1_month_essential_expenses");
      // Essential monthly outflows = 2,000,000 (streams) + 1,000,000 (bills) = 3,000,000
      expect(state.targetMinor).toBe(3_000_000);
      // Liquid accounts = 5,000,000 (bank) + 2,000,000 (cash) = 7,000,000 (excluding investment and cc)
      expect(state.liquidBalanceMinor).toBe(7_000_000);
      expect(state.bufferGapMinor).toBe(0);
      expect(state.bufferSurplusMinor).toBe(4_000_000);
    });

    it("evaluates fixed_amount preference correctly", async () => {
      mockRepository.findEffective.mockResolvedValue({
        id: "11111111-1111-4111-8111-111111111111",
        userId: "user-1",
        version: 1,
        mode: "fixed_amount",
        amountMinor: 10_000_000,
        months: null,
        emergencyFundGoalId: null,
        effectiveFrom: new Date("2026-08-01"),
        createdAt: new Date("2026-08-01")
      });

      const state = await service.getState("user-1");

      expect(state.isFallback).toBe(false);
      expect(state.targetMinor).toBe(10_000_000);
      expect(state.liquidBalanceMinor).toBe(7_000_000);
      expect(state.bufferGapMinor).toBe(3_000_000);
      expect(state.bufferSurplusMinor).toBe(0);
    });
  });

  describe("createVersionInTx", () => {
    it("creates a new version and logs audit record", async () => {
      mockRepository.findLatestVersion.mockResolvedValue({ version: 2 });
      mockRepository.createVersion.mockResolvedValue({
        id: "22222222-2222-4222-8222-222222222222",
        userId: "user-1",
        version: 3,
        mode: "fixed_amount",
        amountMinor: 5_000_000,
        months: null,
        emergencyFundGoalId: null,
        effectiveFrom: new Date("2026-08-01"),
        createdAt: new Date("2026-08-01")
      });

      const tx = focusedTestDouble<DbTx>({});
      const created = await service.createVersionInTx(
        "user-1",
        {
          mode: "fixed_amount",
          amountMinor: 5_000_000
        },
        tx
      );

      expect(created.version).toBe(3);
      expect(mockAudit.record).toHaveBeenCalledWith(
        "user-1",
        "safety_buffer.version_create",
        "22222222-2222-4222-8222-222222222222",
        tx,
        expect.any(Object)
      );
    });

    it("throws EntityNotFoundError if linked emergency fund goal does not exist", async () => {
      mockRepository.findGoal.mockResolvedValue(null);

      const tx = focusedTestDouble<DbTx>({});
      await expect(
        service.createVersionInTx(
          "user-1",
          {
            mode: "emergency_fund_goal",
            emergencyFundGoalId: "00000000-0000-4000-8000-000000000000"
          },
          tx
        )
      ).rejects.toThrow(EntityNotFoundError);
    });
  });
});
