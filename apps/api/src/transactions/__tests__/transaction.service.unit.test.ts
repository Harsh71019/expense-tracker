import { describe, expect, it, vi } from "vitest";

import type { AccountRepository } from "../../accounts/account.repository.js";
import type { AuditRepository } from "../../audit/audit.repository.js";
import type { CategoryRepository } from "../../categories/category.repository.js";
import type { DrizzleDb } from "../../common/db/db.module.js";
import { CategoryKindMismatchError } from "../../common/errors/category-kind-mismatch.error.js";

import { EntityNotFoundError } from "../../common/errors/entity-not-found.error.js";
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

    // @ts-expect-error mock logger
    return new TransactionService(db, accountsRepo, categoriesRepo, txRepo, auditRepo, logger);
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
});
