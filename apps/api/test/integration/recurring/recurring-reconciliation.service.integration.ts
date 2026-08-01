import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { Transaction } from "@treasury-ops/shared";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { CategoryRepository } from "../../../src/categories/category.repository.js";
import { RuntimeConfigService } from "../../../src/common/config/runtime-config.service.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import {
  notificationOutbox,
  recurringReconciliations,
  transactions as transactionsTable
} from "../../../src/common/db/schema/index.js";
import { IdempotencyPostgresRepository } from "../../../src/common/idempotency/idempotency-postgres.repository.js";
import { IdempotencyPostgresService } from "../../../src/common/idempotency/idempotency-postgres.service.js";
import { NotificationOutboxRepository } from "../../../src/notifications/notification-outbox.repository.js";
import { RecurringMaterializeService } from "../../../src/recurring/recurring-materialize.service.js";
import { RecurringReconciliationRepository } from "../../../src/recurring/recurring-reconciliation.repository.js";
import { RecurringReconciliationService } from "../../../src/recurring/recurring-reconciliation.service.js";
import { RecurringRuleRepository } from "../../../src/recurring/recurring-rule.repository.js";
import { RecurringRuleService } from "../../../src/recurring/recurring-rule.service.js";
import { TransactionRepository } from "../../../src/transactions/transaction.repository.js";
import { TransactionService } from "../../../src/transactions/transaction.service.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

const NOOP_LOGGER = { log: () => undefined, warn: () => undefined, error: () => undefined };
const USER_ID = "user-a";

describe("RecurringReconciliationService (integration)", () => {
  let testDb: TestDb;
  let accounts: AccountRepository;
  let rules: RecurringRuleRepository;
  let ruleService: RecurringRuleService;
  let transactionRepository: TransactionRepository;
  let transactionsService: TransactionService;
  let reconciliations: RecurringReconciliationRepository;
  let reconciliationService: RecurringReconciliationService;
  let accountId: string;
  let ruleCounter = 0;

  beforeAll(async () => {
    testDb = await createTestDb();
    await insertTestUser(testDb.db, USER_ID);

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

    // RecurringReconciliationService depends on TransactionRepository/
    // AccountRepository directly (not TransactionService) specifically so
    // this isn't circular -- see reverse-transaction-in-tx.ts. That lets it
    // be constructed first and passed straight in as TransactionService's
    // TRANSACTION_CREATED_HOOK below, exercising the *real* create() -> hook
    // -> reconcileIncoming path (including the `source === "api"` gate
    // inside create() itself) rather than each test calling
    // reconcileIncoming by hand.
    reconciliations = new RecurringReconciliationRepository(testDb.db);
    reconciliationService = new RecurringReconciliationService(
      testDb.db,
      transactionRepository,
      accounts,
      reconciliations,
      new NotificationOutboxRepository(testDb.db),
      new AuditRepository(testDb.db),
      new IdempotencyPostgresService(testDb.db, new IdempotencyPostgresRepository(testDb.db)),
      NOOP_LOGGER
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

    const account = await withTxn(testDb.db, (tx) =>
      accounts.create(
        "user-a",
        { name: "HDFC Savings", type: "bank", openingBalanceMinor: 10_000_000 },
        tx
      )
    );
    accountId = account.id;
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  /**
   * Creates a due monthly rule and immediately materializes it (worker
   * role), returning the posted `recurring`-sourced transaction row -- the
   * bait each test reconciles an incoming `api`-sourced transaction against.
   */
  async function postRecurringTransaction(amountMinor: number): Promise<Transaction> {
    ruleCounter += 1;
    const description = `Recurring fixture ${ruleCounter}`;
    await ruleService.create(USER_ID, {
      template: { accountId, type: "expense", amountMinor, description, tags: [] },
      rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
      startAt: new Date("2020-01-01T00:00:00.000Z")
    });
    const materializer = new RecurringMaterializeService(
      testDb.db,
      new RuntimeConfigService(),
      rules,
      accounts,
      transactionRepository,
      new AuditRepository(testDb.db),
      NOOP_LOGGER
    );
    await materializer.materialize();
    const txn = await transactionRepository.findMany(USER_ID, { limit: 200 });
    const posted = txn.items.find(
      (item) => item.description === description && item.source === "recurring"
    );
    if (posted === undefined) throw new Error("Recurring fixture did not materialize.");
    return posted;
  }

  async function postIncomingApiTransaction(
    amountMinor: number,
    occurredAt: Date
  ): Promise<Transaction> {
    const result = await transactionsService.create(
      USER_ID,
      { accountId, type: "expense", amountMinor, occurredAt, description: "Bank debit", tags: [] },
      randomUUID(),
      "api"
    );
    return result.transaction;
  }

  async function statusOf(transactionId: string): Promise<string | undefined> {
    const [row] = await testDb.db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.id, transactionId));
    return row?.status;
  }

  async function reconciliationRowFor(incomingTransactionId: string) {
    const [row] = await testDb.db
      .select()
      .from(recurringReconciliations)
      .where(eq(recurringReconciliations.incomingTransactionId, incomingTransactionId));
    return row;
  }

  it("auto-reconciles a clean match: the recurring posting is reversed, the API posting stands", async () => {
    const recurringTxn = await postRecurringTransaction(200_000);

    const incoming = await postIncomingApiTransaction(200_000, recurringTxn.occurredAt);

    expect(await statusOf(recurringTxn.id)).toBe("reversed");
    expect(await statusOf(incoming.id)).toBe("posted");

    const row = await reconciliationRowFor(incoming.id);
    expect(row?.status).toBe("auto_matched");
    expect(row?.recurringTransactionId).toBe(recurringTxn.id);
  });

  it("flags two equally-good recurring candidates as ambiguous, without reversing either", async () => {
    const first = await postRecurringTransaction(300_000);
    const second = await postRecurringTransaction(300_000);

    const incoming = await postIncomingApiTransaction(300_000, first.occurredAt);

    expect(await statusOf(first.id)).toBe("posted");
    expect(await statusOf(second.id)).toBe("posted");

    const row = await reconciliationRowFor(incoming.id);
    if (row === undefined) throw new Error("unreachable");
    expect(row.status).toBe("ambiguous");
    expect([...row.candidateRecurringTransactionIds].sort()).toEqual([first.id, second.id].sort());

    const [notification] = await testDb.db
      .select()
      .from(notificationOutbox)
      .where(
        and(
          eq(notificationOutbox.userId, USER_ID),
          eq(notificationOutbox.type, "recurring_reconciliation_pending")
        )
      );
    expect(notification).toBeDefined();

    const pending = await reconciliationService.listPending(USER_ID);
    const listed = pending.find((item) => item.id === row.id);
    if (listed === undefined) throw new Error("Expected the pending row to be listed.");
    expect(listed.incomingTransaction.id).toBe(incoming.id);
    expect(listed.candidateTransactions.map((txn) => txn.id).sort()).toEqual(
      [first.id, second.id].sort()
    );
  });

  it("flags a same-account, in-window candidate with a different amount as amount_mismatch, and resolving it as a duplicate reverses the recurring txn exactly once even when replayed", async () => {
    const recurringTxn = await postRecurringTransaction(400_000);

    const incoming = await postIncomingApiTransaction(450_000, recurringTxn.occurredAt);

    expect(await statusOf(recurringTxn.id)).toBe("posted");
    const row = await reconciliationRowFor(incoming.id);
    expect(row?.status).toBe("amount_mismatch");
    expect(row?.candidateRecurringTransactionIds).toEqual([recurringTxn.id]);
    if (row === undefined) throw new Error("unreachable");
    const reconciliationId = row.id;

    const key = randomUUID();
    const first = await reconciliationService.resolve(
      USER_ID,
      reconciliationId,
      { resolution: "confirmed_duplicate" },
      key
    );
    expect(first.replayed).toBe(false);
    expect(first.result.resolution).toBe("confirmed_duplicate");
    expect(await statusOf(recurringTxn.id)).toBe("reversed");

    const replay = await reconciliationService.resolve(
      USER_ID,
      reconciliationId,
      { resolution: "confirmed_duplicate" },
      key
    );
    expect(replay.replayed).toBe(true);

    const reversalRows = await testDb.db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.reversalOf, recurringTxn.id));
    expect(reversalRows).toHaveLength(1);
  });

  it("resolves an ambiguous reconciliation as confirmed_distinct without reversing anything", async () => {
    const first = await postRecurringTransaction(500_000);
    const second = await postRecurringTransaction(500_000);
    const incoming = await postIncomingApiTransaction(500_000, first.occurredAt);
    const row = await reconciliationRowFor(incoming.id);
    if (row === undefined) throw new Error("unreachable");

    const result = await reconciliationService.resolve(
      USER_ID,
      row.id,
      { resolution: "confirmed_distinct" },
      randomUUID()
    );
    expect(result.result.resolution).toBe("confirmed_distinct");

    expect(await statusOf(first.id)).toBe("posted");
    expect(await statusOf(second.id)).toBe("posted");
  });

  it("reverses only the chosen candidate when resolving an ambiguous reconciliation as a duplicate", async () => {
    const first = await postRecurringTransaction(600_000);
    const second = await postRecurringTransaction(600_000);
    const incoming = await postIncomingApiTransaction(600_000, first.occurredAt);
    const row = await reconciliationRowFor(incoming.id);
    if (row === undefined) throw new Error("unreachable");

    await reconciliationService.resolve(
      USER_ID,
      row.id,
      { resolution: "confirmed_duplicate", chosenRecurringTransactionId: second.id },
      randomUUID()
    );

    expect(await statusOf(first.id)).toBe("posted");
    expect(await statusOf(second.id)).toBe("reversed");
  });

  it("never reconciles a session-authenticated (manual) transaction against a recurring posting", async () => {
    const recurringTxn = await postRecurringTransaction(700_000);

    const manual = await transactionsService.create(
      USER_ID,
      {
        accountId,
        type: "expense",
        amountMinor: 700_000,
        occurredAt: recurringTxn.occurredAt,
        description: "Typed by hand",
        tags: []
      },
      randomUUID(),
      "manual"
    );

    expect(await statusOf(recurringTxn.id)).toBe("posted");
    expect(await reconciliationRowFor(manual.transaction.id)).toBeUndefined();
  });
});
