import { describe, expect, it, vi } from "vitest";

import type { AccountRepository } from "../../accounts/account.repository.js";
import type { AuditRepository } from "../../audit/audit.repository.js";
import type { DrizzleDb } from "../../common/db/db.module.js";
import { EntityNotFoundError } from "../../common/errors/entity-not-found.error.js";
import type { TransactionRepository } from "../transaction.repository.js";

import { TransferService } from "../transfer.service.js";

describe("TransferService Unit Tests", () => {
  const sampleTxOut = {
    id: "tx_out",
    userId: "u1",
    accountId: "acc_1",
    type: "expense" as const,
    status: "posted" as const,
    amountMinor: 10000,
    currency: "INR" as const,
    source: "manual" as const,
    occurredAt: new Date("2026-01-01"),
    description: "Transfer to Savings",
    tags: [],
    transferGroupId: "group_1",
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const sampleTxIn = {
    id: "tx_in",
    userId: "u1",
    accountId: "acc_2",
    type: "income" as const,
    status: "posted" as const,
    amountMinor: 10000,
    currency: "INR" as const,
    source: "manual" as const,
    occurredAt: new Date("2026-01-01"),
    description: "Transfer from Checking",
    tags: [],
    transferGroupId: "group_1",
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const createService = (opts: {
    mockDb?: unknown;
    mockAccounts?: unknown;
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
    // @ts-expect-error mock tx repo
    const txRepo: TransactionRepository = opts.mockTx ?? {};
    // @ts-expect-error mock audit repo
    const auditRepo: AuditRepository = opts.mockAudit ?? { record: vi.fn() };
    const logger = opts.mockLogger ?? { log: vi.fn(), warn: vi.fn() };

    // @ts-expect-error mock logger
    return new TransferService(db, accountsRepo, txRepo, auditRepo, logger);
  };

  it("creates paired transfer transactions successfully", async () => {
    const mockAccounts = {
      applyBalanceDelta: vi.fn(async () => "applied")
    };
    const mockTx = {
      create: vi.fn().mockResolvedValueOnce(sampleTxOut).mockResolvedValueOnce(sampleTxIn)
    };

    const service = createService({ mockAccounts, mockTx });
    const res = await service.create(
      "u1",
      {
        fromAccountId: "acc_1",
        toAccountId: "acc_2",
        amountMinor: 10000,
        occurredAt: new Date("2026-01-01T00:00:00Z"),
        description: "Transfer",
        tags: []
      },
      "idempotency-key-1"
    );

    expect(res.fromTransaction.id).toBe("tx_out");
    expect(res.toTransaction.id).toBe("tx_in");
    expect(res.replayed).toBe(false);
  });

  it("throws EntityNotFoundError if source account does not exist", async () => {
    const mockAccounts = {
      applyBalanceDelta: vi.fn(async () => "account_not_found")
    };
    const service = createService({ mockAccounts });

    await expect(
      service.create(
        "u1",
        {
          fromAccountId: "acc_99",
          toAccountId: "acc_2",
          amountMinor: 10000,
          occurredAt: new Date("2026-01-01T00:00:00Z"),
          description: "Transfer",
          tags: []
        },
        undefined
      )
    ).rejects.toThrow(EntityNotFoundError);
  });
});
