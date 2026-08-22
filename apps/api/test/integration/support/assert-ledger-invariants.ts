import {
  accounts,
  creditCardBills,
  receivableEvents,
  receivables,
  transactions
} from "../../../src/common/db/schema/index.js";
import type { DrizzleDb } from "../../../src/common/db/db.module.js";

const INCREASE_EVENT_KINDS = new Set(["opening", "correction_increase", "legacy_increase"]);
const DECREASE_EVENT_KINDS = new Set(["repayment", "correction_decrease", "legacy_decrease"]);

export async function assertLedgerInvariants(db: DrizzleDb): Promise<void> {
  const accountRows = await db.select().from(accounts);
  const transactionRows = await db.select().from(transactions);
  const billRows = await db.select().from(creditCardBills);
  const receivableRows = await db.select().from(receivables);
  const receivableEventRows = await db.select().from(receivableEvents);
  const billsById = new Map(billRows.map((bill) => [bill.id, bill]));
  const deltas = new Map<string, number>();
  const transferGroups = new Map<string, typeof transactionRows>();

  for (const transaction of transactionRows) {
    // Every row here -- "posted", "reversed", or "reversal" -- already had its
    // balance effect applied exactly once at creation/reversal time (see
    // TransactionService.reverse: the original's decrement is never undone,
    // a separate compensating reversal row applies the opposite delta).
    // Excluding "reversed" rows would double-count that sign flip and leave
    // every reversed-then-credited pair off by its own amount.
    const signed =
      transaction.type === "income" ? transaction.amountMinor : -transaction.amountMinor;
    deltas.set(transaction.accountId, (deltas.get(transaction.accountId) ?? 0) + signed);
    if (transaction.transferGroupId !== null) {
      const group = transferGroups.get(transaction.transferGroupId) ?? [];
      group.push(transaction);
      transferGroups.set(transaction.transferGroupId, group);
    }
    if (transaction.billId !== null) {
      const bill = billsById.get(transaction.billId);
      if (
        bill === undefined ||
        transaction.type !== "income" ||
        transaction.transferGroupId === null ||
        transaction.accountId !== bill.accountId ||
        transaction.userId !== bill.userId
      ) {
        throw new Error(`Transaction ${transaction.id} has an invalid credit-card bill tag.`);
      }
    }
  }

  for (const account of accountRows) {
    const expected = account.openingBalanceMinor + (deltas.get(account.id) ?? 0);
    if (account.balanceMinor !== expected) {
      throw new Error(
        `Balance invariant failed for account ${account.id}: expected ${expected}, got ${account.balanceMinor}.`
      );
    }
  }

  for (const [transferGroupId, legs] of transferGroups) {
    if (legs.length !== 2) {
      throw new Error(`Transfer group ${transferGroupId} has ${legs.length} legs instead of 2.`);
    }
    const [first, second] = legs;
    if (
      first === undefined ||
      second === undefined ||
      first.amountMinor !== second.amountMinor ||
      first.type === second.type
    ) {
      throw new Error(`Transfer group ${transferGroupId} does not conserve value.`);
    }
  }

  const receivablesById = new Map(receivableRows.map((receivable) => [receivable.id, receivable]));
  const transactionsById = new Map(
    transactionRows.map((transaction) => [transaction.id, transaction])
  );
  const linkedTransactionIds = new Map<string, string>();
  const runningBalanceByReceivable = new Map<string, number>();
  const principalTransactionEventCount = new Map<string, number>();

  for (const event of receivableEventRows) {
    const receivable = receivablesById.get(event.receivableId);
    if (receivable === undefined || receivable.userId !== event.userId) {
      throw new Error(
        `Receivable event ${event.id} references receivable ${event.receivableId} outside its tenant.`
      );
    }

    let linkedTransaction: (typeof transactionRows)[number] | undefined;
    if (event.transactionId !== null) {
      linkedTransaction = transactionsById.get(event.transactionId);
      if (linkedTransaction === undefined || linkedTransaction.userId !== event.userId) {
        throw new Error(
          `Receivable event ${event.id} references transaction ${event.transactionId} outside its tenant.`
        );
      }

      const existingOwner = linkedTransactionIds.get(event.transactionId);
      if (existingOwner !== undefined) {
        throw new Error(
          `Transaction ${event.transactionId} is linked from more than one receivable event.`
        );
      }
      linkedTransactionIds.set(event.transactionId, event.id);

      if (event.kind === "opening" && linkedTransaction.type !== "expense") {
        throw new Error(
          `Receivable opening event ${event.id}'s linked transaction is not an expense.`
        );
      }
      if (event.kind === "repayment" && linkedTransaction.type !== "income") {
        throw new Error(
          `Receivable repayment event ${event.id}'s linked transaction is not income.`
        );
      }

      if (linkedTransaction.purpose === "receivable_principal") {
        principalTransactionEventCount.set(
          linkedTransaction.id,
          (principalTransactionEventCount.get(linkedTransaction.id) ?? 0) + 1
        );
      }
    }

    // Reversal-aware: a transaction-backed event stops contributing once its
    // linked transaction has been reversed (plan doc §8); transactionless
    // opening/correction/legacy events always contribute.
    const isEffective = linkedTransaction === undefined || linkedTransaction.status !== "reversed";
    if (isEffective) {
      const signed = INCREASE_EVENT_KINDS.has(event.kind)
        ? event.amountMinor
        : DECREASE_EVENT_KINDS.has(event.kind)
          ? -event.amountMinor
          : 0;
      runningBalanceByReceivable.set(
        event.receivableId,
        (runningBalanceByReceivable.get(event.receivableId) ?? 0) + signed
      );
    }
  }

  for (const transaction of transactionRows) {
    if (transaction.purpose !== "receivable_principal") continue;
    const linkedEventCount = principalTransactionEventCount.get(transaction.id) ?? 0;
    if (linkedEventCount !== 1) {
      throw new Error(
        `Transaction ${transaction.id} has purpose receivable_principal but is linked from ${linkedEventCount} receivable events (expected exactly 1).`
      );
    }
  }

  for (const [receivableId, balance] of runningBalanceByReceivable) {
    if (balance < 0) {
      throw new Error(
        `Receivable ${receivableId} has a negative derived outstanding balance (${balance}).`
      );
    }
  }
}
