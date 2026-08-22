import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { CategoryRepository } from "../../../src/categories/category.repository.js";
import { RuntimeConfigService } from "../../../src/common/config/runtime-config.service.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import {
  recurringOccurrences,
  transactions as transactionsTable
} from "../../../src/common/db/schema/index.js";
import { EntityNotFoundError } from "../../../src/common/errors/entity-not-found.error.js";
import { InvalidRecurringOccurrenceSourceError } from "../../../src/common/errors/invalid-recurring-occurrence-source.error.js";
import { RecurringOccurrenceAlreadyConfirmedError } from "../../../src/common/errors/recurring-occurrence-already-confirmed.error.js";
import { IdempotencyPostgresRepository } from "../../../src/common/idempotency/idempotency-postgres.repository.js";
import { IdempotencyPostgresService } from "../../../src/common/idempotency/idempotency-postgres.service.js";
import { NotificationOutboxRepository } from "../../../src/notifications/notification-outbox.repository.js";
import { RecurringMaterializeService } from "../../../src/recurring/recurring-materialize.service.js";
import { RecurringOccurrenceRepository } from "../../../src/recurring/recurring-occurrence.repository.js";
import { RecurringOccurrenceService } from "../../../src/recurring/recurring-occurrence.service.js";
import { RecurringReconciliationRepository } from "../../../src/recurring/recurring-reconciliation.repository.js";
import { RecurringReconciliationService } from "../../../src/recurring/recurring-reconciliation.service.js";
import { RecurringRuleRepository } from "../../../src/recurring/recurring-rule.repository.js";
import { RecurringRuleService } from "../../../src/recurring/recurring-rule.service.js";
import { TransactionRepository } from "../../../src/transactions/transaction.repository.js";
import { TransactionService } from "../../../src/transactions/transaction.service.js";
import { assertLedgerInvariants } from "../support/assert-ledger-invariants.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

const NOOP_LOGGER = { log: () => undefined, warn: () => undefined, error: () => undefined };
const NOOP_MODULE_REF = {
  get: () => ({ onTransactionReversedInTx: async () => undefined })
};
const USER_ID = "user-a";
const OTHER_USER_ID = "user-b";

describe("manual-post recurring occurrences (integration)", () => {
  let testDb: TestDb;
  let accounts: AccountRepository;
  let rules: RecurringRuleRepository;
  let ruleService: RecurringRuleService;
  let transactionRepository: TransactionRepository;
  let transactionsService: TransactionService;
  let occurrences: RecurringOccurrenceRepository;
  let occurrenceService: RecurringOccurrenceService;
  let materializer: RecurringMaterializeService;
  let bankAccountId: string;
  let walletAccountId: string;

  beforeAll(async () => {
    testDb = await createTestDb();
    await insertTestUser(testDb.db, USER_ID);
    await insertTestUser(testDb.db, OTHER_USER_ID);

    process.env.DATABASE_URL = testDb.connectionUri;
    process.env.REDIS_URL = "redis://127.0.0.1:6379/12";
    process.env.TRUSTED_ORIGINS = "http://localhost:3000";
    process.env.BETTER_AUTH_SECRET = "test-secret-long-enough-32-chars-long";
    process.env.BETTER_AUTH_URL = "http://localhost:4000";
    process.env.SERVICE_ROLE = "worker";

    accounts = new AccountRepository(testDb.db);
    rules = new RecurringRuleRepository(testDb.db);
    ruleService = new RecurringRuleService(
      testDb.db,
      rules,
      accounts,
      new CategoryRepository(testDb.db)
    );
    transactionRepository = new TransactionRepository(testDb.db);
    occurrences = new RecurringOccurrenceRepository(testDb.db);
    occurrenceService = new RecurringOccurrenceService(
      occurrences,
      rules,
      transactionRepository,
      new AuditRepository(testDb.db),
      new IdempotencyPostgresService(testDb.db, new IdempotencyPostgresRepository(testDb.db))
    );

    const reconciliationService = new RecurringReconciliationService(
      testDb.db,
      transactionRepository,
      accounts,
      new RecurringReconciliationRepository(testDb.db),
      occurrences,
      new NotificationOutboxRepository(testDb.db),
      new AuditRepository(testDb.db),
      new IdempotencyPostgresService(testDb.db, new IdempotencyPostgresRepository(testDb.db)),
      NOOP_LOGGER,
      NOOP_MODULE_REF
    );
    transactionsService = new TransactionService(
      testDb.db,
      accounts,
      new CategoryRepository(testDb.db),
      transactionRepository,
      new AuditRepository(testDb.db),
      NOOP_LOGGER,
      reconciliationService
    );

    materializer = new RecurringMaterializeService(
      testDb.db,
      new RuntimeConfigService(),
      rules,
      accounts,
      transactionRepository,
      occurrences,
      new AuditRepository(testDb.db),
      NOOP_LOGGER
    );

    const bank = await withTxn(testDb.db, (tx) =>
      accounts.create(
        USER_ID,
        { name: "HDFC Savings", type: "bank", openingBalanceMinor: 10_000_000 },
        tx
      )
    );
    bankAccountId = bank.id;
    const wallet = await withTxn(testDb.db, (tx) =>
      accounts.create(USER_ID, { name: "Paytm Wallet", type: "wallet", openingBalanceMinor: 0 }, tx)
    );
    walletAccountId = wallet.id;
  }, 60_000);

  afterAll(async () => {
    await assertLedgerInvariants(testDb.db);
    await testDb.teardown();
  });

  async function createManualRule(
    amountMinor: number,
    description: string,
    startAt = new Date("2020-01-01T00:00:00.000Z"),
    rrule = "FREQ=MONTHLY;BYMONTHDAY=1"
  ) {
    return ruleService.create(USER_ID, {
      template: { accountId: bankAccountId, type: "expense", amountMinor, description, tags: [] },
      rrule,
      startAt,
      autoPost: false
    });
  }

  /**
   * A due-but-recent occurrence date, so status derives as "expected" rather
   * than "missed" (MISSED_GRACE_DAYS = 7) — for tests asserting the exact
   * still-outstanding status, as opposed to tests further below that only
   * need "not yet confirmed" (where "expected" vs "missed" both qualify).
   */
  function recentDueDate(): Date {
    return new Date(Date.now() - 2 * 24 * 60 * 60 * 1_000);
  }

  it("materializes an expected occurrence instead of a ledger transaction, without touching the balance", async () => {
    const rule = await createManualRule(
      50_000,
      "Manual gym membership",
      recentDueDate(),
      "FREQ=DAILY;COUNT=1"
    );
    const balanceBefore = await accountBalance();

    await materializer.materialize();

    expect(await accountBalance()).toBe(balanceBefore);
    const posted = await testDb.db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.description, "Manual gym membership"));
    expect(posted).toHaveLength(0);

    const page = await occurrenceService.list(USER_ID, rule.id, { limit: 50 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ status: "expected", recurringRuleId: rule.id });

    const stored = await rules.findById(USER_ID, rule.id);
    expect(stored?.isPaused).toBe(true);
  });

  it("links an existing transaction to an occurrence idempotently, without creating a new one", async () => {
    const rule = await createManualRule(
      75_000,
      "Manual internet bill",
      new Date("2020-03-01T00:00:00.000Z")
    );
    await materializer.materialize();
    const [occurrence] = (await occurrenceService.list(USER_ID, rule.id, { limit: 50 })).items;
    if (occurrence === undefined) throw new Error("Expected an occurrence fixture");

    const sourceTxn = await withTxn(testDb.db, async (tx) => {
      if (!(await accounts.applyBalanceDelta(USER_ID, bankAccountId, -75_000, tx))) {
        throw new EntityNotFoundError("Account");
      }
      return transactionRepository.create(
        USER_ID,
        {
          accountId: bankAccountId,
          type: "expense",
          amountMinor: 75_000,
          occurredAt: new Date("2020-03-01T10:00:00.000Z"),
          description: "UPI/DR/000000000000/INTERNET BILL",
          tags: []
        },
        undefined,
        tx
      );
    });

    const key = randomUUID();
    const attempts = await Promise.all(
      Array.from({ length: 5 }, () =>
        occurrenceService.linkPayment(
          USER_ID,
          rule.id,
          occurrence.id,
          { transactionId: sourceTxn.id },
          key
        )
      )
    );
    expect(attempts.filter((result) => !result.replayed)).toHaveLength(1);
    expect(attempts[0]?.result.status).toBe("confirmed");
    expect(attempts[0]?.result.confirmedTransactionId).toBe(sourceTxn.id);

    const linked = await transactionRepository.findById(USER_ID, sourceTxn.id);
    expect(linked?.recurringRuleId).toBe(rule.id);
    expect(linked?.amountMinor).toBe(75_000);
    expect(linked?.type).toBe("expense");

    await expect(
      occurrenceService.linkPayment(
        USER_ID,
        rule.id,
        occurrence.id,
        { transactionId: sourceTxn.id },
        randomUUID()
      )
    ).rejects.toThrow(RecurringOccurrenceAlreadyConfirmedError);
  });

  it("rejects ineligible source transactions and cross-tenant access", async () => {
    const rule = await createManualRule(
      60_000,
      "Manual phone bill",
      new Date("2020-04-01T00:00:00.000Z")
    );
    await materializer.materialize();
    const [occurrence] = (await occurrenceService.list(USER_ID, rule.id, { limit: 50 })).items;
    if (occurrence === undefined) throw new Error("Expected an occurrence fixture");

    async function makeTxn(accountId: string, type: "expense" | "income", amountMinor: number) {
      return withTxn(testDb.db, async (tx) => {
        const delta = type === "income" ? amountMinor : -amountMinor;
        if (!(await accounts.applyBalanceDelta(USER_ID, accountId, delta, tx))) {
          throw new EntityNotFoundError("Account");
        }
        return transactionRepository.create(
          USER_ID,
          {
            accountId,
            type,
            amountMinor,
            occurredAt: new Date("2020-04-01T00:00:00.000Z"),
            description: "Candidate",
            tags: []
          },
          undefined,
          tx
        );
      });
    }

    const wrongAccount = await makeTxn(walletAccountId, "expense", 60_000);
    await expect(
      occurrenceService.linkPayment(
        USER_ID,
        rule.id,
        occurrence.id,
        { transactionId: wrongAccount.id },
        randomUUID()
      )
    ).rejects.toThrow(InvalidRecurringOccurrenceSourceError);

    const wrongType = await makeTxn(bankAccountId, "income", 60_000);
    await expect(
      occurrenceService.linkPayment(
        USER_ID,
        rule.id,
        occurrence.id,
        { transactionId: wrongType.id },
        randomUUID()
      )
    ).rejects.toThrow(InvalidRecurringOccurrenceSourceError);

    const eligible = await makeTxn(bankAccountId, "expense", 60_000);
    await expect(
      occurrenceService.linkPayment(
        OTHER_USER_ID,
        rule.id,
        occurrence.id,
        { transactionId: eligible.id },
        randomUUID()
      )
    ).rejects.toThrow(EntityNotFoundError);
  });

  it("auto-confirms a clean match posted through the real TransactionCreatedHook pipeline", async () => {
    const rule = await createManualRule(
      120_000,
      "Manual netflix",
      new Date("2020-05-01T00:00:00.000Z")
    );
    await materializer.materialize();
    const [occurrence] = (await occurrenceService.list(USER_ID, rule.id, { limit: 50 })).items;
    if (occurrence === undefined) throw new Error("Expected an occurrence fixture");

    const result = await transactionsService.create(
      USER_ID,
      {
        accountId: bankAccountId,
        type: "expense",
        amountMinor: 120_000,
        occurredAt: new Date("2020-05-01T10:00:00.000Z"),
        description: "UPI/DR/000000000001/NETFLIX",
        tags: []
      },
      randomUUID(),
      "api"
    );

    const confirmed = await occurrenceService.list(USER_ID, rule.id, { limit: 50 });
    expect(confirmed.items[0]).toMatchObject({
      status: "confirmed",
      confirmedTransactionId: result.transaction.id
    });
    const linked = await transactionRepository.findById(USER_ID, result.transaction.id);
    expect(linked?.recurringRuleId).toBe(rule.id);
  });

  it("does not auto-confirm an ambiguous match, leaving the occurrence outstanding for manual linking", async () => {
    const dueDate = recentDueDate();
    const first = await createManualRule(90_000, "Manual rule A", dueDate, "FREQ=DAILY;COUNT=1");
    const second = await createManualRule(90_000, "Manual rule B", dueDate, "FREQ=DAILY;COUNT=1");
    await materializer.materialize();

    await transactionsService.create(
      USER_ID,
      {
        accountId: bankAccountId,
        type: "expense",
        amountMinor: 90_000,
        occurredAt: dueDate,
        description: "Ambiguous candidate",
        tags: []
      },
      randomUUID(),
      "api"
    );

    const firstOccurrences = await occurrenceService.list(USER_ID, first.id, { limit: 50 });
    const secondOccurrences = await occurrenceService.list(USER_ID, second.id, { limit: 50 });
    expect(firstOccurrences.items[0]?.status).toBe("expected");
    expect(secondOccurrences.items[0]?.status).toBe("expected");

    const outstanding = await occurrenceService.listOutstanding(USER_ID);
    expect(outstanding.map((item) => item.id)).toEqual(
      expect.arrayContaining([firstOccurrences.items[0]?.id, secondOccurrences.items[0]?.id])
    );
  });

  it("derives a missed status once the grace period has elapsed, without a stored status change", async () => {
    const rule = await createManualRule(
      40_000,
      "Manual overdue rule",
      new Date("2019-01-01T00:00:00.000Z")
    );
    await materializer.materialize();
    const [occurrence] = (await occurrenceService.list(USER_ID, rule.id, { limit: 50 })).items;
    if (occurrence === undefined) throw new Error("Expected an occurrence fixture");

    const [dbRow] = await testDb.db
      .select()
      .from(recurringOccurrences)
      .where(eq(recurringOccurrences.id, occurrence.id));
    expect(dbRow?.status).toBe("expected");
    expect(occurrence.status).toBe("missed");
  });

  async function accountBalance(): Promise<number> {
    const account = await accounts.findById(USER_ID, bankAccountId);
    if (account === null) throw new Error("Expected bank account fixture");
    return account.balanceMinor;
  }
});
