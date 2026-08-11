import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { CategoryRepository } from "../../../src/categories/category.repository.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import {
  pendingTransactions,
  transactions as transactionsTable
} from "../../../src/common/db/schema/index.js";
import { EntityNotFoundError } from "../../../src/common/errors/entity-not-found.error.js";
import { PendingTransactionAlreadyResolvedError } from "../../../src/common/errors/pending-transaction-already-resolved.error.js";
import { IdempotencyPostgresRepository } from "../../../src/common/idempotency/idempotency-postgres.repository.js";
import { IdempotencyPostgresService } from "../../../src/common/idempotency/idempotency-postgres.service.js";
import { PendingTransactionMutationService } from "../../../src/pending-transactions/pending-transaction-mutation.service.js";
import { PendingTransactionRepository } from "../../../src/pending-transactions/pending-transaction.repository.js";
import { PendingTransactionService } from "../../../src/pending-transactions/pending-transaction.service.js";
import { TransactionRepository } from "../../../src/transactions/transaction.repository.js";
import { TransactionService } from "../../../src/transactions/transaction.service.js";
import { assertLedgerInvariants } from "../support/assert-ledger-invariants.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

const NOOP_LOGGER = { log: () => undefined, warn: () => undefined, error: () => undefined };
const USER_A = "pending-user-a";
const USER_B = "pending-user-b";

describe("PendingTransactionService (integration)", () => {
  let testDb: TestDb;
  let accounts: AccountRepository;
  let pending: PendingTransactionRepository;
  let service: PendingTransactionService;
  let mutations: PendingTransactionMutationService;
  let transactionRepository: TransactionRepository;
  let accountId: string;

  beforeAll(async () => {
    testDb = await createTestDb();
    await insertTestUser(testDb.db, USER_A);
    await insertTestUser(testDb.db, USER_B);

    process.env.DATABASE_URL = testDb.connectionUri;
    process.env.REDIS_URL = "redis://127.0.0.1:6379/12";
    process.env.TRUSTED_ORIGINS = "http://localhost:3000";
    process.env.BETTER_AUTH_SECRET = "test-secret-long-enough-32-chars-long";
    process.env.BETTER_AUTH_URL = "http://localhost:4000";

    accounts = new AccountRepository(testDb.db);
    pending = new PendingTransactionRepository(testDb.db);
    transactionRepository = new TransactionRepository(testDb.db);
    const audit = new AuditRepository(testDb.db);
    const transactionsService = new TransactionService(
      testDb.db,
      accounts,
      new CategoryRepository(testDb.db),
      transactionRepository,
      audit,
      NOOP_LOGGER
    );
    service = new PendingTransactionService(
      testDb.db,
      pending,
      accounts,
      transactionsService,
      audit
    );
    mutations = new PendingTransactionMutationService(
      service,
      new IdempotencyPostgresService(testDb.db, new IdempotencyPostgresRepository(testDb.db))
    );

    const account = await withTxn(testDb.db, (tx) =>
      accounts.create(
        USER_A,
        { name: "HDFC Credit Card", type: "credit_card", openingBalanceMinor: 0 },
        tx
      )
    );
    accountId = account.id;
  }, 60_000);

  afterEach(async () => {
    await assertLedgerInvariants(testDb.db);
  });

  afterAll(async () => {
    await testDb.teardown();
  });

  it("creates a pending transaction without any ledger effect", async () => {
    const created = await service.create(USER_A, {
      accountId,
      type: "expense",
      occurredAt: new Date("2026-07-18T00:00:00.000Z"),
      description: "Anthropic — USD 23.60, INR amount pending"
    });

    expect(created.status).toBe("pending");
    expect(created.resultingTransactionId).toBeUndefined();

    const ledgerRows = await transactionRepository.findMany(USER_A, { accountId, limit: 50 });
    expect(ledgerRows.items).toHaveLength(0);
  });

  it("confirms a pending transaction into a real transaction and applies the balance delta", async () => {
    const created = await service.create(USER_A, {
      accountId,
      type: "expense",
      occurredAt: new Date("2026-07-18T00:00:00.000Z"),
      description: "Anthropic — USD 23.60, INR amount pending"
    });

    const before = await accounts.findById(USER_A, accountId);
    const confirmed = await service.confirm(
      USER_A,
      created.id,
      { amountMinor: 199_900 },
      randomUUID()
    );

    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.resultingTransactionId).toBeDefined();

    const after = await accounts.findById(USER_A, accountId);
    expect((before?.balanceMinor ?? 0) - 199_900).toBe(after?.balanceMinor);

    const [ledgerRow] =
      confirmed.resultingTransactionId === undefined
        ? []
        : await testDb.db
            .select()
            .from(transactionsTable)
            .where(eq(transactionsTable.id, confirmed.resultingTransactionId));
    expect(ledgerRow?.amountMinor).toBe(199_900);
    expect(ledgerRow?.source).toBe("manual");
  });

  it("replays a confirm called twice with the same idempotency key without posting twice", async () => {
    const created = await service.create(USER_A, {
      accountId,
      type: "expense",
      occurredAt: new Date("2026-07-19T00:00:00.000Z"),
      description: "Recurring fixture — needs amount"
    });
    const key = randomUUID();

    const [first, second] = await Promise.all([
      service.confirm(USER_A, created.id, { amountMinor: 50_000 }, key),
      service.confirm(USER_A, created.id, { amountMinor: 50_000 }, key)
    ]);

    expect(first.resultingTransactionId).toBe(second.resultingTransactionId);
    if (first.resultingTransactionId === undefined) throw new Error("unreachable");
    const ledgerRows = await testDb.db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.id, first.resultingTransactionId));
    expect(ledgerRows).toHaveLength(1);
  });

  it("rejects confirming a pending transaction that was already dismissed", async () => {
    const created = await service.create(USER_A, {
      accountId,
      type: "expense",
      occurredAt: new Date("2026-07-20T00:00:00.000Z"),
      description: "Unwanted charge"
    });
    await service.dismiss(USER_A, created.id);

    await expect(
      service.confirm(USER_A, created.id, { amountMinor: 1_000 }, randomUUID())
    ).rejects.toBeInstanceOf(PendingTransactionAlreadyResolvedError);
  });

  it("dismisses a pending transaction with no ledger effect, replaying idempotently through the mutation service", async () => {
    const created = await service.create(USER_A, {
      accountId,
      type: "expense",
      occurredAt: new Date("2026-07-21T00:00:00.000Z"),
      description: "Duplicate alert email"
    });
    const key = randomUUID();

    const [first, second] = await Promise.all([
      mutations.dismiss(USER_A, created.id, key),
      mutations.dismiss(USER_A, created.id, key)
    ]);
    expect([first.replayed, second.replayed].sort()).toEqual([false, true]);

    const [row] = await testDb.db
      .select()
      .from(pendingTransactions)
      .where(eq(pendingTransactions.id, created.id));
    expect(row?.status).toBe("dismissed");
  });

  it("scopes pending transactions by tenant: another user cannot confirm or dismiss them", async () => {
    const created = await service.create(USER_A, {
      accountId,
      type: "expense",
      occurredAt: new Date("2026-07-22T00:00:00.000Z"),
      description: "Tenant-scoped fixture"
    });

    await expect(
      service.confirm(USER_B, created.id, { amountMinor: 100 }, randomUUID())
    ).rejects.toBeInstanceOf(EntityNotFoundError);
    await expect(service.dismiss(USER_B, created.id)).rejects.toBeInstanceOf(EntityNotFoundError);

    await expect(
      testDb.db
        .select()
        .from(pendingTransactions)
        .where(and(eq(pendingTransactions.id, created.id), eq(pendingTransactions.userId, USER_A)))
    ).resolves.toHaveLength(1);
  });
});
