import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { BillGenerationCron } from "../../../src/bills/bill-generation.cron.js";
import { BillReconciliationService } from "../../../src/bills/bill-reconciliation.service.js";
import { BillStatementRepository } from "../../../src/bills/bill-statement.repository.js";
import { BillsService } from "../../../src/bills/bills.service.js";
import { CreditCardBillRepository } from "../../../src/bills/credit-card-bill.repository.js";
import { accounts as accountsTable } from "../../../src/common/db/schema/index.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import { BillOverpaymentError } from "../../../src/common/errors/bill-overpayment.error.js";
import { BillNotReconciledError } from "../../../src/common/errors/bill-not-reconciled.error.js";
import { BillStatementUnresolvedError } from "../../../src/common/errors/bill-statement-unresolved.error.js";
import { EntityNotFoundError } from "../../../src/common/errors/entity-not-found.error.js";
import { InvalidBillPaymentSourceError } from "../../../src/common/errors/invalid-bill-payment-source.error.js";
import { InvalidCreditCardAccountError } from "../../../src/common/errors/invalid-credit-card-account.error.js";
import { IdempotencyPostgresRepository } from "../../../src/common/idempotency/idempotency-postgres.repository.js";
import { IdempotencyPostgresService } from "../../../src/common/idempotency/idempotency-postgres.service.js";
import { TransactionRepository } from "../../../src/transactions/transaction.repository.js";
import { TransferService } from "../../../src/transactions/transfer.service.js";
import { assertLedgerInvariants } from "../support/assert-ledger-invariants.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

const USER_ID = "bill-user";
const OTHER_USER_ID = "bill-other-user";
const NOOP_LOGGER = { log: () => undefined, warn: () => undefined, error: () => undefined };
const MAPPING = {
  date: "Date",
  description: "Description",
  amount: "Amount",
  dateFormat: "DD/MM/YYYY",
  amountConvention: "single_signed"
} as const;

describe("credit-card bill lifecycle", () => {
  let testDb: TestDb;
  let accounts: AccountRepository;
  let transactions: TransactionRepository;
  let bills: CreditCardBillRepository;
  let statements: BillStatementRepository;
  let reconciliation: BillReconciliationService;
  let billService: BillsService;
  let transfers: TransferService;
  let cardId: string;
  let bankId: string;

  beforeAll(async () => {
    testDb = await createTestDb();
    await insertTestUser(testDb.db, USER_ID);
    await insertTestUser(testDb.db, OTHER_USER_ID);

    accounts = new AccountRepository(testDb.db);
    transactions = new TransactionRepository(testDb.db);
    bills = new CreditCardBillRepository(testDb.db);
    statements = new BillStatementRepository(testDb.db);
    const audit = new AuditRepository(testDb.db);
    const idempotency = new IdempotencyPostgresService(
      testDb.db,
      new IdempotencyPostgresRepository(testDb.db)
    );
    transfers = new TransferService(testDb.db, accounts, transactions, audit, NOOP_LOGGER);
    const queue = { enqueueParse: vi.fn().mockResolvedValue(undefined) };
    reconciliation = new BillReconciliationService(
      testDb.db,
      bills,
      statements,
      transactions,
      audit,
      idempotency,
      // @ts-expect-error - structural queue stub; no Redis is needed for service integration
      queue
    );
    billService = new BillsService(
      accounts,
      bills,
      statements,
      transactions,
      transfers,
      audit,
      idempotency
    );

    const card = await withTxn(testDb.db, (tx) =>
      accounts.create(
        USER_ID,
        {
          name: "HDFC Card",
          type: "credit_card",
          openingBalanceMinor: 0,
          creditCardConfig: { statementDay: 25, dueDay: 15 }
        },
        tx,
        new Date("2026-07-25T00:00:00.000Z")
      )
    );
    cardId = card.id;
    const bank = await withTxn(testDb.db, (tx) =>
      accounts.create(
        USER_ID,
        { name: "HDFC Savings", type: "bank", openingBalanceMinor: 100_000 },
        tx
      )
    );
    bankId = bank.id;

    await testDb.db
      .update(accountsTable)
      .set({ nextStatementAt: new Date("2026-07-25T00:00:00.000Z") })
      .where(eq(accountsTable.id, cardId));

    await postCardEntry("expense", 10_000, "2026-07-10T00:00:00.000Z", "Groceries");
    await postCardEntry("income", 2_000, "2026-07-12T00:00:00.000Z", "Refund");
  }, 60_000);

  afterAll(async () => {
    await assertLedgerInvariants(testDb.db);
    await testDb.teardown();
  });

  async function postCardEntry(
    type: "expense" | "income",
    amountMinor: number,
    occurredAt: string,
    description: string
  ): Promise<void> {
    await withTxn(testDb.db, async (tx) => {
      const delta = type === "income" ? amountMinor : -amountMinor;
      if (!(await accounts.applyBalanceDelta(USER_ID, cardId, delta, tx))) {
        throw new EntityNotFoundError("Account");
      }
      await transactions.create(
        USER_ID,
        {
          accountId: cardId,
          type,
          amountMinor,
          occurredAt: new Date(occurredAt),
          description,
          tags: []
        },
        undefined,
        tx
      );
    });
  }

  it("generates one ledger-derived bill under concurrent cron attempts", async () => {
    const card = await accounts.findById(USER_ID, cardId);
    if (card === null) throw new Error("Expected card fixture");
    const config = { env: { SERVICE_ROLE: "worker" } };
    const cron = new BillGenerationCron(
      testDb.db,
      // @ts-expect-error - only SERVICE_ROLE is used by generateOne test setup
      config,
      accounts,
      bills,
      transactions,
      new AuditRepository(testDb.db),
      NOOP_LOGGER
    );

    await Promise.all(Array.from({ length: 5 }, () => cron.generateOne(card)));
    const page = await bills.findMany(USER_ID, { limit: 50 });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      accountId: cardId,
      amountDueMinor: 8_000,
      reconciliationStatus: "awaiting_statement",
      paidMinor: 0,
      remainingMinor: 8_000,
      paymentStatus: "unpaid"
    });
  });

  it("updates credit-card configuration idempotently and rejects a bank account", async () => {
    const key = "90909090-aaaa-4909-8909-909090909090";
    const updates = await Promise.all(
      Array.from({ length: 5 }, () =>
        billService.updateCreditCardConfig(USER_ID, cardId, { statementDay: 26, dueDay: 16 }, key)
      )
    );
    expect(updates.filter((result) => !result.replayed)).toHaveLength(1);
    expect(updates[0]?.result.creditCardConfig).toMatchObject({
      statementDay: 26,
      dueDay: 16
    });
    await expect(
      billService.updateCreditCardConfig(
        USER_ID,
        bankId,
        { statementDay: 25, dueDay: 15 },
        "80808080-aaaa-4808-8808-808080808080"
      )
    ).rejects.toThrow(InvalidCreditCardAccountError);
  });

  it("blocks reconciliation candidates by tenant, account, type, amount, and date", async () => {
    const query = {
      accountId: cardId,
      from: new Date("2026-07-09T00:00:00.000Z"),
      toExclusive: new Date("2026-07-12T00:00:00.000Z"),
      types: ["expense"] as const,
      amountMinors: [10_000],
      limit: 10
    };
    const matching = await transactions.findBoundedReconciliationCandidates(USER_ID, query);
    expect(matching.limitHit).toBe(false);
    expect(matching.items).toHaveLength(1);
    expect(matching.items[0]).toMatchObject({ type: "expense", amountMinor: 10_000 });

    const otherUser = await transactions.findBoundedReconciliationCandidates(OTHER_USER_ID, query);
    expect(otherUser.items).toEqual([]);
  });

  it("uploads, matches, and reconciles the issuer CSV before payment", async () => {
    const [bill] = (await bills.findMany(USER_ID, { limit: 50 })).items;
    if (bill === undefined) throw new Error("Expected generated bill");
    const unresolvedCsv = ["Date,Description,Amount", "10/07/2026,Unknown,-99.99"].join("\n");
    const unresolvedUpload = await reconciliation.upload(
      USER_ID,
      bill.id,
      "unresolved.csv",
      "text/csv",
      Buffer.from(unresolvedCsv),
      MAPPING,
      "10101010-aaaa-4101-8101-101010101010"
    );
    await reconciliation.parseStatement(
      unresolvedUpload.result.id,
      bill.id,
      USER_ID,
      MAPPING,
      unresolvedCsv
    );
    await expect(
      reconciliation.reconcile(USER_ID, bill.id, "20202020-aaaa-4202-8202-202020202020")
    ).rejects.toThrow(BillStatementUnresolvedError);
    await expect(
      billService.pay(
        USER_ID,
        bill.id,
        {
          fromAccountId: bankId,
          amountMinor: 1_000,
          occurredAt: new Date("2026-08-01T10:00:00.000Z")
        },
        "30303030-aaaa-4303-8303-303030303030"
      )
    ).rejects.toThrow(BillNotReconciledError);

    const csv = [
      "Date,Description,Amount",
      "10/07/2026,Groceries,-100.00",
      "12/07/2026,Refund,20.00"
    ].join("\n");
    const upload = await reconciliation.upload(
      USER_ID,
      bill.id,
      "statement.csv",
      "text/csv",
      Buffer.from(csv),
      MAPPING,
      "11111111-aaaa-4111-8111-111111111111"
    );
    expect(upload.result.status).toBe("pending");

    await expect(
      reconciliation.parseStatement(upload.result.id, bill.id, OTHER_USER_ID, MAPPING, csv)
    ).rejects.toThrow(EntityNotFoundError);

    await reconciliation.parseStatement(upload.result.id, bill.id, USER_ID, MAPPING, csv);
    const rows = await reconciliation.listRows(USER_ID, bill.id, { limit: 50 });
    expect(rows.items).toHaveLength(2);
    expect(rows.items.every((row) => row.matchStatus === "matched")).toBe(true);
    expect(rows.items.every((row) => row.matchSuggestion?.method === "global_assignment_v1")).toBe(
      true
    );
    expect(rows.items.every((row) => row.matchSuggestion?.inputWatermark.length === 64)).toBe(true);
    expect(rows.items.every((row) => row.matchSuggestion?.evidence.assignedCost !== null)).toBe(
      true
    );

    const reconciled = await reconciliation.reconcile(
      USER_ID,
      bill.id,
      "22222222-aaaa-4222-8222-222222222222"
    );
    expect(reconciled.result.reconciliationStatus).toBe("reconciled");
  });

  it("pays idempotently, prevents concurrent overpayment, and derives reversal state", async () => {
    const [bill] = (await bills.findMany(USER_ID, { limit: 50 })).items;
    if (bill === undefined) throw new Error("Expected generated bill");
    const key = "33333333-aaaa-4333-8333-333333333333";
    const attempts = await Promise.all(
      Array.from({ length: 5 }, () =>
        billService.pay(
          USER_ID,
          bill.id,
          {
            fromAccountId: bankId,
            amountMinor: 3_000,
            occurredAt: new Date("2026-08-10T10:00:00.000Z")
          },
          key
        )
      )
    );
    expect(attempts.filter((result) => !result.replayed)).toHaveLength(1);
    expect(new Set(attempts.map((result) => result.result.transfer.transferGroupId)).size).toBe(1);
    expect(attempts[0]?.result.transfer.toTransaction.billId).toBe(bill.id);

    const partial = await bills.findById(USER_ID, bill.id);
    expect(partial).toMatchObject({
      paidMinor: 3_000,
      remainingMinor: 5_000,
      paymentStatus: "partial"
    });

    const transferGroupId = attempts[0]?.result.transfer.transferGroupId;
    if (transferGroupId === undefined) throw new Error("Expected transfer result");
    await transfers.reverse(USER_ID, transferGroupId);
    expect(await bills.findById(USER_ID, bill.id)).toMatchObject({
      paidMinor: 0,
      remainingMinor: 8_000,
      paymentStatus: "unpaid"
    });

    const competing = await Promise.allSettled([
      billService.pay(
        USER_ID,
        bill.id,
        {
          fromAccountId: bankId,
          amountMinor: 5_000,
          occurredAt: new Date("2026-08-11T10:00:00.000Z")
        },
        "44444444-aaaa-4444-8444-444444444444"
      ),
      billService.pay(
        USER_ID,
        bill.id,
        {
          fromAccountId: bankId,
          amountMinor: 5_000,
          occurredAt: new Date("2026-08-11T10:00:00.000Z")
        },
        "55555555-aaaa-4555-8555-555555555555"
      )
    ]);
    expect(competing.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = competing.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" ? rejected.reason : null).toBeInstanceOf(
      BillOverpaymentError
    );
    expect(await bills.findById(USER_ID, bill.id)).toMatchObject({
      paidMinor: 5_000,
      remainingMinor: 3_000,
      paymentStatus: "partial"
    });
  });

  it("links an existing (e.g. n8n-posted) expense as a bill payment without a reconciliation gate", async () => {
    const [bill] = (await bills.findMany(USER_ID, { limit: 50 })).items;
    if (bill === undefined) throw new Error("Expected generated bill");
    expect(bill.remainingMinor).toBe(3_000);
    expect(bill.reconciliationStatus).toBe("reconciled");

    // Simulate an n8n-ingested plain expense on the bank account: one leg, no transferGroupId,
    // no billId — exactly what POST /v1/transactions produces for a bank-alert-derived payment.
    const sourceTxn = await withTxn(testDb.db, async (tx) => {
      if (!(await accounts.applyBalanceDelta(USER_ID, bankId, -3_000, tx))) {
        throw new EntityNotFoundError("Account");
      }
      return transactions.create(
        USER_ID,
        {
          accountId: bankId,
          type: "expense",
          amountMinor: 3_000,
          occurredAt: new Date("2026-08-12T10:00:00.000Z"),
          description: "UPI/DR/000000000000/CREDIT CARD BILL",
          tags: []
        },
        undefined,
        tx
      );
    });

    const key = "66666666-aaaa-4666-8666-666666666666";
    const attempts = await Promise.all(
      Array.from({ length: 5 }, () =>
        billService.linkPayment(USER_ID, bill.id, { transactionId: sourceTxn.id }, key)
      )
    );
    expect(attempts.filter((result) => !result.replayed)).toHaveLength(1);
    expect(new Set(attempts.map((result) => result.result.transfer.transferGroupId)).size).toBe(1);
    expect(attempts[0]?.result.transfer.fromTransaction.id).toBe(sourceTxn.id);
    expect(attempts[0]?.result.transfer.toTransaction.billId).toBe(bill.id);
    expect(attempts[0]?.result.bill).toMatchObject({
      paidMinor: 8_000,
      remainingMinor: 0,
      paymentStatus: "paid"
    });

    const linked = await transactions.findById(USER_ID, sourceTxn.id);
    expect(linked?.transferGroupId).toBe(attempts[0]?.result.transfer.transferGroupId);
    expect(linked?.amountMinor).toBe(3_000);
    expect(linked?.type).toBe("expense");
    expect(linked?.accountId).toBe(bankId);

    // The bill is now fully paid, so a second attempt is rejected as an overpayment before the
    // service even re-examines the (already-linked) source transaction.
    await expect(
      billService.linkPayment(
        USER_ID,
        bill.id,
        { transactionId: sourceTxn.id },
        "77777777-aaaa-4777-8777-777777777777"
      )
    ).rejects.toThrow(BillOverpaymentError);
  });

  it("rejects ineligible source transactions for linking", async () => {
    const secondCard = await withTxn(testDb.db, (tx) =>
      accounts.create(
        USER_ID,
        {
          name: "ICICI Card",
          type: "credit_card",
          openingBalanceMinor: 0,
          creditCardConfig: { statementDay: 25, dueDay: 15 }
        },
        tx,
        new Date("2026-07-25T00:00:00.000Z")
      )
    );
    const bill = await withTxn(testDb.db, (tx) =>
      bills.create(
        USER_ID,
        {
          accountId: secondCard.id,
          cycleStart: new Date("2026-06-26T00:00:00.000Z"),
          cycleEnd: new Date("2026-07-25T00:00:00.000Z"),
          dueDate: new Date("2026-08-15T00:00:00.000Z"),
          amountDueMinor: 5_000
        },
        tx
      )
    );

    async function makeExpense(accountId: string, amountMinor: number): Promise<string> {
      return withTxn(testDb.db, async (tx) => {
        if (!(await accounts.applyBalanceDelta(USER_ID, accountId, -amountMinor, tx))) {
          throw new EntityNotFoundError("Account");
        }
        const txn = await transactions.create(
          USER_ID,
          {
            accountId,
            type: "expense",
            amountMinor,
            occurredAt: new Date("2026-08-01T00:00:00.000Z"),
            description: "Candidate payment",
            tags: []
          },
          undefined,
          tx
        );
        return txn.id;
      });
    }

    const onOwnCard = await makeExpense(secondCard.id, 1_000);
    await expect(
      billService.linkPayment(
        USER_ID,
        bill.id,
        { transactionId: onOwnCard },
        "88888888-aaaa-4888-8888-888888888888"
      )
    ).rejects.toThrow(InvalidBillPaymentSourceError);

    const fromAnotherCreditCard = await makeExpense(cardId, 1_000);
    await expect(
      billService.linkPayment(
        USER_ID,
        bill.id,
        { transactionId: fromAnotherCreditCard },
        "99999999-aaaa-4999-8999-999999999999"
      )
    ).rejects.toThrow(InvalidBillPaymentSourceError);

    const overpaying = await makeExpense(bankId, 9_000);
    await expect(
      billService.linkPayment(
        USER_ID,
        bill.id,
        { transactionId: overpaying, amountMinor: 6_000 },
        "10001000-aaaa-4100-8100-100010001000"
      )
    ).rejects.toThrow(BillOverpaymentError);

    await expect(
      billService.linkPayment(
        OTHER_USER_ID,
        bill.id,
        { transactionId: overpaying },
        "20002000-aaaa-4200-8200-200020002000"
      )
    ).rejects.toThrow(EntityNotFoundError);

    // A bill with plenty of headroom left, so a second link attempt on an already-linked
    // transaction is rejected for being already linked, not for overpaying a spent-down bill.
    const roomyBill = await withTxn(testDb.db, (tx) =>
      bills.create(
        USER_ID,
        {
          accountId: secondCard.id,
          cycleStart: new Date("2026-07-26T00:00:00.000Z"),
          cycleEnd: new Date("2026-08-25T00:00:00.000Z"),
          dueDate: new Date("2026-09-15T00:00:00.000Z"),
          amountDueMinor: 20_000
        },
        tx
      )
    );
    const reusable = await makeExpense(bankId, 1_000);
    const firstLink = await billService.linkPayment(
      USER_ID,
      roomyBill.id,
      { transactionId: reusable },
      "30003000-aaaa-4300-8300-300030003000"
    );
    expect(firstLink.result.bill.remainingMinor).toBe(19_000);
    await expect(
      billService.linkPayment(
        USER_ID,
        roomyBill.id,
        { transactionId: reusable },
        "40004000-aaaa-4400-8400-400040004000"
      )
    ).rejects.toThrow(InvalidBillPaymentSourceError);
  });

  it("does not expose another user's bill", async () => {
    const [bill] = (await bills.findMany(USER_ID, { limit: 50 })).items;
    if (bill === undefined) throw new Error("Expected generated bill");
    await expect(billService.get(OTHER_USER_ID, bill.id)).rejects.toThrow(EntityNotFoundError);
  });
});
