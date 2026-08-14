import { describe, expect, it, vi } from "vitest";

import type { AccountRepository } from "../../accounts/account.repository.js";
import type { AuditRepository } from "../../audit/audit.repository.js";
import type { CategoryRepository } from "../../categories/category.repository.js";
import type { DrizzleDb } from "../../common/db/db.module.js";
import { CategoryKindMismatchError } from "../../common/errors/category-kind-mismatch.error.js";

import { EntityNotFoundError } from "../../common/errors/entity-not-found.error.js";
import { TransferMetadataRequiresGroupError } from "../../common/errors/transfer-metadata-requires-group.error.js";
import { focusedTestDouble } from "../../test/mock-drizzle.js";
import type { TransactionRepository } from "../transaction.repository.js";

import { TransactionService } from "../transaction.service.js";

describe("TransactionService Unit Tests", () => {
  const sampleTx = {
    id: "tx_123",
    userId: "u1",
    accountId: "acc_1",
    type: "expense" as const,
    status: "posted" as const,
    amountMinor: 5000,
    currency: "INR" as const,
    source: "manual" as const,
    occurredAt: new Date("2026-01-01"),
    description: "Coffee",
    tags: ["food"],
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const createService = (opts: {
    mockDb?: unknown;
    mockAccounts?: unknown;
    mockCategories?: unknown;
    mockTx?: unknown;
    mockAudit?: unknown;
    mockLogger?: unknown;
    mockCreatedHook?: unknown;
  }) => {
    // @ts-expect-error mock db
    const db: DrizzleDb = opts.mockDb ?? {
      transaction: vi.fn(async (cb: (tx: string) => Promise<unknown>) => cb("tx1"))
    };
    // @ts-expect-error mock accounts repo
    const accountsRepo: AccountRepository = opts.mockAccounts ?? {};
    // @ts-expect-error mock categories repo
    const categoriesRepo: CategoryRepository = opts.mockCategories ?? {};
    // @ts-expect-error mock tx repo
    const txRepo: TransactionRepository = opts.mockTx ?? {};
    // @ts-expect-error mock audit repo
    const auditRepo: AuditRepository = opts.mockAudit ?? { record: vi.fn() };
    const logger = opts.mockLogger ?? { log: vi.fn(), warn: vi.fn() };

    const createdHook = opts.mockCreatedHook;

    return new TransactionService(
      db,
      accountsRepo,
      categoriesRepo,
      txRepo,
      auditRepo,
      focusedTestDouble(logger),
      focusedTestDouble(createdHook)
    );
  };

  describe("create", () => {
    it("creates transaction and applies balance delta when valid", async () => {
      const mockAccounts = {
        applyBalanceDelta: vi.fn(async () => "applied")
      };
      const mockTx = { create: vi.fn(async () => sampleTx) };

      const service = createService({ mockAccounts, mockTx });
      const res = await service.create(
        "u1",
        {
          accountId: "acc_1",
          type: "expense",
          amountMinor: 5000,
          occurredAt: new Date("2026-01-01T00:00:00Z"),
          description: "Coffee",
          tags: ["food"]
        },
        "idempotency-key-1"
      );

      expect(res.transaction.description).toBe("Coffee");
      expect(res.replayed).toBe(false);
      expect(mockAccounts.applyBalanceDelta).toHaveBeenCalledWith("u1", "acc_1", -5000, "tx1");
    });

    it("runs API reconciliation inside the ledger transaction and propagates failures", async () => {
      const failure = new Error("reconciliation failed");
      const mockAccounts = { applyBalanceDelta: vi.fn(async () => "applied") };
      const apiTransaction = { ...sampleTx, source: "api" as const };
      const mockTx = { create: vi.fn(async () => apiTransaction) };
      const mockCreatedHook = {
        onTransactionCreatedInTx: vi.fn(async () => Promise.reject(failure))
      };
      const service = createService({ mockAccounts, mockTx, mockCreatedHook });

      await expect(
        service.create(
          "u1",
          {
            accountId: "acc_1",
            type: "expense",
            amountMinor: 5000,
            occurredAt: new Date("2026-01-01T00:00:00Z"),
            description: "Coffee",
            tags: []
          },
          undefined,
          "api"
        )
      ).rejects.toBe(failure);
      expect(mockCreatedHook.onTransactionCreatedInTx).toHaveBeenCalledWith(
        "u1",
        apiTransaction,
        "tx1"
      );
    });

    it("throws EntityNotFoundError if account does not exist on create", async () => {
      const mockAccounts = { applyBalanceDelta: vi.fn(async () => "account_not_found") };
      const service = createService({ mockAccounts });

      await expect(
        service.create(
          "u1",
          {
            accountId: "acc_99",
            type: "expense",
            amountMinor: 5000,
            occurredAt: new Date("2026-01-01T00:00:00Z"),
            description: "Coffee",
            tags: []
          },
          undefined
        )
      ).rejects.toThrow(EntityNotFoundError);
    });

    it("throws CategoryKindMismatchError if category kind differs from txn type", async () => {
      const mockCategories = {
        findActiveById: vi.fn(async () => ({ id: "cat_1", kind: "income" }))
      };
      const service = createService({ mockCategories });

      await expect(
        service.create(
          "u1",
          {
            accountId: "acc_1",
            categoryId: "cat_1",
            type: "expense",
            amountMinor: 5000,
            occurredAt: new Date("2026-01-01T00:00:00Z"),
            description: "Coffee",
            tags: []
          },
          undefined
        )
      ).rejects.toThrow(CategoryKindMismatchError);
    });
  });

  it("requests insights for the current IST month", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T19:00:00.000Z"));
    const mockTx = {
      getInsights: vi.fn(async () => ({ month: "2026-08" }))
    };
    const service = createService({ mockTx });

    await service.getInsights("u1");

    expect(mockTx.getInsights).toHaveBeenCalledWith("u1", "2026-08");
    vi.useRealTimers();
  });

  describe("assignCategoryInTx", () => {
    const firstId = "3fa85f64-5717-4562-b3fc-2c963f66be01";
    const secondId = "3fa85f64-5717-4562-b3fc-2c963f66be02";
    const categoryId = "3fa85f64-5717-4562-b3fc-2c963f66be99";
    const input = { transactionIds: [firstId, secondId], categoryId };

    it("updates and audits the whole tenant-scoped batch", async () => {
      const rows = [
        { ...sampleTx, id: firstId, categoryId: undefined },
        { ...sampleTx, id: secondId, categoryId: "3fa85f64-5717-4562-b3fc-2c963f66be88" }
      ];
      const mockCategories = {
        findActiveById: vi.fn(async () => ({ id: categoryId, kind: "expense" }))
      };
      const mockTx = {
        findByIds: vi.fn(async () => rows),
        assignCategory: vi.fn(async () => 2)
      };
      const mockAudit = { recordMany: vi.fn(async () => undefined) };
      const service = createService({ mockCategories, mockTx, mockAudit });

      await expect(
        service.assignCategoryInTx("u1", input, focusedTestDouble("db-tx"))
      ).resolves.toEqual({
        ...input,
        updatedCount: 2
      });
      expect(mockTx.findByIds).toHaveBeenCalledWith("u1", input.transactionIds, "db-tx");
      expect(mockTx.assignCategory).toHaveBeenCalledWith(
        "u1",
        input.transactionIds,
        categoryId,
        "db-tx"
      );
      expect(mockAudit.recordMany).toHaveBeenCalledWith(
        "u1",
        "transaction.update",
        expect.arrayContaining([
          expect.objectContaining({ entityId: firstId }),
          expect.objectContaining({ entityId: secondId })
        ]),
        "db-tx"
      );
    });

    it("rejects a missing category or transaction without writing", async () => {
      const missingCategory = createService({
        mockCategories: { findActiveById: vi.fn(async () => null) }
      });
      await expect(
        missingCategory.assignCategoryInTx("u1", input, focusedTestDouble("db-tx"))
      ).rejects.toThrow(EntityNotFoundError);

      const assignCategory = vi.fn();
      const missingTransaction = createService({
        mockCategories: {
          findActiveById: vi.fn(async () => ({ id: categoryId, kind: "expense" }))
        },
        mockTx: { findByIds: vi.fn(async () => [{ ...sampleTx, id: firstId }]), assignCategory }
      });
      await expect(
        missingTransaction.assignCategoryInTx("u1", input, focusedTestDouble("db-tx"))
      ).rejects.toThrow(EntityNotFoundError);
      expect(assignCategory).not.toHaveBeenCalled();
    });

    it("rejects transfer legs and category-kind mismatches", async () => {
      const category = { id: categoryId, kind: "expense" };
      const transfer = createService({
        mockCategories: { findActiveById: vi.fn(async () => category) },
        mockTx: {
          findByIds: vi.fn(async () => [
            { ...sampleTx, id: firstId, transferGroupId: "group-1" },
            { ...sampleTx, id: secondId }
          ])
        }
      });
      await expect(
        transfer.assignCategoryInTx("u1", input, focusedTestDouble("db-tx"))
      ).rejects.toThrow(TransferMetadataRequiresGroupError);

      const wrongKind = createService({
        mockCategories: { findActiveById: vi.fn(async () => category) },
        mockTx: {
          findByIds: vi.fn(async () => [
            { ...sampleTx, id: firstId, type: "income" },
            { ...sampleTx, id: secondId }
          ])
        }
      });
      await expect(
        wrongKind.assignCategoryInTx("u1", input, focusedTestDouble("db-tx"))
      ).rejects.toThrow(CategoryKindMismatchError);
    });

    it("rolls back when the bulk update does not cover the validated batch", async () => {
      const service = createService({
        mockCategories: {
          findActiveById: vi.fn(async () => ({ id: categoryId, kind: "expense" }))
        },
        mockTx: {
          findByIds: vi.fn(async () => [
            { ...sampleTx, id: firstId },
            { ...sampleTx, id: secondId }
          ]),
          assignCategory: vi.fn(async () => 1)
        }
      });

      await expect(
        service.assignCategoryInTx("u1", input, focusedTestDouble("db-tx"))
      ).rejects.toThrow(EntityNotFoundError);
    });
  });
});
