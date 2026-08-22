import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { CategoryRepository } from "../../../src/categories/category.repository.js";
import { transactions } from "../../../src/common/db/schema/index.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import { EntityNotFoundError } from "../../../src/common/errors/entity-not-found.error.js";
import { ReceivableOverpaymentError } from "../../../src/common/errors/receivable-overpayment.error.js";
import { ReceivableReversalBlockedError } from "../../../src/common/errors/receivable-reversal-blocked.error.js";
import { ReceivableTransactionAlreadyLinkedError } from "../../../src/common/errors/receivable-transaction-already-linked.error.js";
import { IdempotencyPostgresRepository } from "../../../src/common/idempotency/idempotency-postgres.repository.js";
import { IdempotencyPostgresService } from "../../../src/common/idempotency/idempotency-postgres.service.js";
import { ReceivableMutationService } from "../../../src/receivables/receivable-mutation.service.js";
import { ReceivableTransactionReversalPolicy } from "../../../src/receivables/receivable-transaction-reversal-policy.js";
import { ReceivableRepository } from "../../../src/receivables/receivable.repository.js";
import { ReceivableService } from "../../../src/receivables/receivable.service.js";
import { TransactionRepository } from "../../../src/transactions/transaction.repository.js";
import { TransactionService } from "../../../src/transactions/transaction.service.js";
import { assertLedgerInvariants } from "../support/assert-ledger-invariants.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

const NOOP_LOGGER = { log: () => undefined, warn: () => undefined, error: () => undefined };

const USERS = [
  "receivable-lend",
  "receivable-idempotent-create",
  "receivable-idempotent-repay",
  "receivable-overpay",
  "receivable-settle",
  "receivable-link",
  "receivable-tenant-a",
  "receivable-tenant-b",
  "receivable-reverse-repay",
  "receivable-reverse-open-blocked",
  "receivable-reverse-open-ok",
  "receivable-race"
];

describe("ReceivableService", () => {
  let testDb: TestDb;
  let accounts: AccountRepository;
  let receivables: ReceivableRepository;
  let service: ReceivableService;
  let mutations: ReceivableMutationService;
  let transactionsService: TransactionService;
  let transactionRepository: TransactionRepository;

  beforeAll(async () => {
    testDb = await createTestDb();
    for (const userId of USERS) await insertTestUser(testDb.db, userId);

    accounts = new AccountRepository(testDb.db);
    receivables = new ReceivableRepository(testDb.db);
    const audit = new AuditRepository(testDb.db);
    const categories = new CategoryRepository(testDb.db);
    transactionRepository = new TransactionRepository(testDb.db);
    const reversalPolicy = new ReceivableTransactionReversalPolicy(receivables);
    transactionsService = new TransactionService(
      testDb.db,
      accounts,
      categories,
      transactionRepository,
      audit,
      NOOP_LOGGER,
      undefined,
      reversalPolicy
    );
    service = new ReceivableService(testDb.db, receivables, transactionsService, audit);
    const idempotencyService = new IdempotencyPostgresService(
      testDb.db,
      new IdempotencyPostgresRepository(testDb.db)
    );
    mutations = new ReceivableMutationService(service, idempotencyService);
  }, 60_000);

  afterEach(async () => {
    await assertLedgerInvariants(testDb.db);
  });

  afterAll(async () => {
    await testDb.teardown();
  });

  async function createAccount(
    userId: string,
    name: string,
    openingBalanceMinor: number
  ): Promise<string> {
    const account = await withTxn(testDb.db, (tx) =>
      accounts.create(userId, { name, type: "bank", openingBalanceMinor }, tx)
    );
    return account.id;
  }

  it("lend_now moves cash into a receivable while net worth stays flat", async () => {
    const accountId = await createAccount("receivable-lend", "Bank", 50_000_00);

    const result = await service.create("receivable-lend", {
      fundingMode: "lend_now",
      counterpartyName: "Rohan",
      principalMinor: 10_000_00,
      accountId,
      openedAt: new Date(),
      description: "Lent to Rohan"
    });

    expect(result.receivable.outstandingMinor).toBe(10_000_00);
    expect(result.receivable.status).toBe("active");

    const account = await accounts.findById("receivable-lend", accountId);
    expect(account?.balanceMinor).toBe(40_000_00);
    // account -10,000 + receivable +10,000 = net worth delta 0.
  });

  it("replays five identical lend_now requests as exactly one effect", async () => {
    const accountId = await createAccount("receivable-idempotent-create", "Bank", 50_000_00);
    const key = randomUUID();
    const input = {
      fundingMode: "lend_now" as const,
      counterpartyName: "Priya",
      principalMinor: 5_000_00,
      accountId,
      openedAt: new Date(),
      description: "Lent to Priya"
    };

    const results = await Promise.all(
      Array.from({ length: 5 }, () => mutations.create("receivable-idempotent-create", input, key))
    );

    const receivableIds = new Set(results.map((r) => r.result.receivable.id));
    expect(receivableIds.size).toBe(1);
    expect(results.filter((r) => r.replayed).length).toBe(4);

    const account = await accounts.findById("receivable-idempotent-create", accountId);
    expect(account?.balanceMinor).toBe(45_000_00);

    const page = await service.list("receivable-idempotent-create", {
      status: "all",
      limit: 50
    });
    expect(page.items.length).toBe(1);
  });

  it("replays five identical repayment requests as exactly one installment", async () => {
    const accountId = await createAccount("receivable-idempotent-repay", "Bank", 0);
    const created = await service.create("receivable-idempotent-repay", {
      fundingMode: "opening_balance",
      counterpartyName: "Amit",
      outstandingMinor: 10_000_00,
      openedAt: new Date()
    });

    const key = randomUUID();
    const input = {
      captureMode: "receive_now" as const,
      accountId,
      amountMinor: 2_500_00,
      occurredAt: new Date(),
      description: "Repayment from Amit"
    };

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        mutations.recordRepayment("receivable-idempotent-repay", created.receivable.id, input, key)
      )
    );

    expect(results.filter((r) => r.replayed).length).toBe(4);
    const receivable = await service.get("receivable-idempotent-repay", created.receivable.id);
    expect(receivable.outstandingMinor).toBe(7_500_00);
    expect(receivable.repaymentCount).toBe(1);

    const account = await accounts.findById("receivable-idempotent-repay", accountId);
    expect(account?.balanceMinor).toBe(2_500_00);
  });

  it("rejects a repayment larger than the outstanding amount", async () => {
    const accountId = await createAccount("receivable-overpay", "Bank", 0);
    const created = await service.create("receivable-overpay", {
      fundingMode: "opening_balance",
      counterpartyName: "Deepa",
      outstandingMinor: 1_000_00,
      openedAt: new Date()
    });

    await expect(
      service.recordRepayment("receivable-overpay", created.receivable.id, {
        captureMode: "receive_now",
        accountId,
        amountMinor: 1_000_01,
        occurredAt: new Date(),
        description: "Overpayment attempt"
      })
    ).rejects.toThrow(ReceivableOverpaymentError);

    const account = await accounts.findById("receivable-overpay", accountId);
    expect(account?.balanceMinor).toBe(0);
  });

  it("settles only when three sequential partial repayments reach exactly zero", async () => {
    const accountId = await createAccount("receivable-settle", "Bank", 0);
    const created = await service.create("receivable-settle", {
      fundingMode: "lend_now",
      counterpartyName: "Kiran",
      principalMinor: 10_000_00,
      accountId: await createAccount("receivable-settle", "Lending source", 10_000_00),
      openedAt: new Date(),
      description: "Lent to Kiran"
    });

    async function repay(amountMinor: number) {
      return service.recordRepayment("receivable-settle", created.receivable.id, {
        captureMode: "receive_now",
        accountId,
        amountMinor,
        occurredAt: new Date(),
        description: "Repayment from Kiran"
      });
    }

    const first = await repay(4_000_00);
    expect(first.receivable.outstandingMinor).toBe(6_000_00);
    expect(first.receivable.status).toBe("active");

    const second = await repay(3_999_99);
    expect(second.receivable.outstandingMinor).toBe(2_000_01);
    expect(second.receivable.status).toBe("active");

    const third = await repay(2_000_01);
    expect(third.receivable.outstandingMinor).toBe(0);
    expect(third.receivable.status).toBe("settled");
  });

  it("links an existing posted deposit without moving the account a second time", async () => {
    const lenderAccountId = await createAccount("receivable-link", "Lender", 10_000_00);
    const depositAccountId = await createAccount("receivable-link", "Deposit account", 0);

    const created = await service.create("receivable-link", {
      fundingMode: "lend_now",
      counterpartyName: "Nisha",
      principalMinor: 10_000_00,
      accountId: lenderAccountId,
      openedAt: new Date(),
      description: "Lent to Nisha"
    });

    const deposit = await transactionsService.create(
      "receivable-link",
      {
        accountId: depositAccountId,
        type: "income",
        amountMinor: 4_000_00,
        occurredAt: new Date(),
        description: "Deposit from Nisha",
        tags: []
      },
      undefined
    );

    const balanceBefore = await accounts.findById("receivable-link", depositAccountId);
    expect(balanceBefore?.balanceMinor).toBe(4_000_00);

    const result = await service.recordRepayment("receivable-link", created.receivable.id, {
      captureMode: "link_existing",
      transactionId: deposit.transaction.id
    });

    expect(result.receivable.outstandingMinor).toBe(6_000_00);

    const balanceAfter = await accounts.findById("receivable-link", depositAccountId);
    expect(balanceAfter?.balanceMinor).toBe(4_000_00);

    // `purpose` is internal-only and deliberately absent from the public
    // Transaction contract (plan doc §7.3), so read the raw row to verify
    // the reclassification.
    const [linkedRow] = await testDb.db
      .select({ purpose: transactions.purpose })
      .from(transactions)
      .where(eq(transactions.id, deposit.transaction.id));
    expect(linkedRow?.purpose).toBe("receivable_principal");

    await expect(
      service.recordRepayment("receivable-link", created.receivable.id, {
        captureMode: "link_existing",
        transactionId: deposit.transaction.id
      })
    ).rejects.toThrow(ReceivableTransactionAlreadyLinkedError);
  });

  it("rejects cross-tenant access to another user's receivable and account", async () => {
    const accountA = await createAccount("receivable-tenant-a", "Bank A", 10_000_00);
    const created = await service.create("receivable-tenant-a", {
      fundingMode: "lend_now",
      counterpartyName: "Tenant A borrower",
      principalMinor: 5_000_00,
      accountId: accountA,
      openedAt: new Date(),
      description: "Lent"
    });

    await expect(service.get("receivable-tenant-b", created.receivable.id)).rejects.toThrow(
      EntityNotFoundError
    );

    await expect(
      service.recordRepayment("receivable-tenant-b", created.receivable.id, {
        captureMode: "receive_now",
        accountId: accountA,
        amountMinor: 1_00,
        occurredAt: new Date(),
        description: "Cross-tenant attempt"
      })
    ).rejects.toThrow(EntityNotFoundError);
  });

  it("restores conservation after a repayment reversal", async () => {
    const lenderAccountId = await createAccount("receivable-reverse-repay", "Lender", 10_000_00);
    const depositAccountId = await createAccount("receivable-reverse-repay", "Deposit", 0);

    const created = await service.create("receivable-reverse-repay", {
      fundingMode: "lend_now",
      counterpartyName: "Sanjay",
      principalMinor: 10_000_00,
      accountId: lenderAccountId,
      openedAt: new Date(),
      description: "Lent to Sanjay"
    });

    const repayment = await service.recordRepayment(
      "receivable-reverse-repay",
      created.receivable.id,
      {
        captureMode: "receive_now",
        accountId: depositAccountId,
        amountMinor: 3_000_00,
        occurredAt: new Date(),
        description: "Repayment from Sanjay"
      }
    );
    expect(repayment.receivable.outstandingMinor).toBe(7_000_00);

    if (repayment.transactionId === undefined) throw new Error("Expected a linked transaction id.");
    await transactionsService.reverse("receivable-reverse-repay", repayment.transactionId);

    const afterReversal = await service.get("receivable-reverse-repay", created.receivable.id);
    expect(afterReversal.outstandingMinor).toBe(10_000_00);

    const depositAccount = await accounts.findById("receivable-reverse-repay", depositAccountId);
    expect(depositAccount?.balanceMinor).toBe(0);
  });

  it("blocks reversing a lend_now opening once a partial repayment exists", async () => {
    const lenderAccountId = await createAccount(
      "receivable-reverse-open-blocked",
      "Lender",
      10_000_00
    );
    const depositAccountId = await createAccount("receivable-reverse-open-blocked", "Deposit", 0);

    const created = await service.create("receivable-reverse-open-blocked", {
      fundingMode: "lend_now",
      counterpartyName: "Meera",
      principalMinor: 10_000_00,
      accountId: lenderAccountId,
      openedAt: new Date(),
      description: "Lent to Meera"
    });

    await service.recordRepayment("receivable-reverse-open-blocked", created.receivable.id, {
      captureMode: "receive_now",
      accountId: depositAccountId,
      amountMinor: 1_000_00,
      occurredAt: new Date(),
      description: "Partial repayment"
    });

    if (created.transactionId === undefined) throw new Error("Expected a linked transaction id.");
    await expect(
      transactionsService.reverse("receivable-reverse-open-blocked", created.transactionId)
    ).rejects.toThrow(ReceivableReversalBlockedError);
  });

  it("allows reversing a lend_now opening when no repayments have been made", async () => {
    const lenderAccountId = await createAccount("receivable-reverse-open-ok", "Lender", 10_000_00);

    const created = await service.create("receivable-reverse-open-ok", {
      fundingMode: "lend_now",
      counterpartyName: "Farhan",
      principalMinor: 10_000_00,
      accountId: lenderAccountId,
      openedAt: new Date(),
      description: "Lent to Farhan"
    });

    if (created.transactionId === undefined) throw new Error("Expected a linked transaction id.");
    await transactionsService.reverse("receivable-reverse-open-ok", created.transactionId);

    const afterReversal = await service.get("receivable-reverse-open-ok", created.receivable.id);
    expect(afterReversal.outstandingMinor).toBe(0);
    expect(afterReversal.status).toBe("cancelled");

    const account = await accounts.findById("receivable-reverse-open-ok", lenderAccountId);
    expect(account?.balanceMinor).toBe(10_000_00);
  });

  it("never lets two concurrent repayments collectively exceed outstanding", async () => {
    const accountId = await createAccount("receivable-race", "Bank", 0);
    const created = await service.create("receivable-race", {
      fundingMode: "opening_balance",
      counterpartyName: "Race counterparty",
      outstandingMinor: 10_000_00,
      openedAt: new Date()
    });

    const attempt = (amountMinor: number) =>
      service
        .recordRepayment("receivable-race", created.receivable.id, {
          captureMode: "receive_now",
          accountId,
          amountMinor,
          occurredAt: new Date(),
          description: "Race repayment"
        })
        .then(
          () => ({ ok: true as const }),
          (error: unknown) => ({ ok: false as const, error })
        );

    // Two concurrent repayments that individually fit but together exceed
    // outstanding -- row-locking via `findByIdForUpdate` serializes them, so
    // exactly one must observe the other's effect and be rejected.
    const [first, second] = await Promise.all([attempt(6_000_00), attempt(6_000_00)]);

    const outcomes = [first, second];
    const succeeded = outcomes.filter((o) => o.ok);
    const failed = outcomes.filter((o) => !o.ok);
    expect(succeeded.length).toBe(1);
    expect(failed.length).toBe(1);
    if (!failed[0]?.ok) expect(failed[0]?.error).toBeInstanceOf(ReceivableOverpaymentError);

    const receivable = await service.get("receivable-race", created.receivable.id);
    expect(receivable.outstandingMinor).toBe(4_000_00);

    const account = await accounts.findById("receivable-race", accountId);
    expect(account?.balanceMinor).toBe(6_000_00);
  });
});
