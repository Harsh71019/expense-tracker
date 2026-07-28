import { accounts, creditCardBills, transactions } from "../../../src/common/db/schema/index.js";
import type { DrizzleDb } from "../../../src/common/db/db.module.js";

export async function assertLedgerInvariants(db: DrizzleDb): Promise<void> {
  const accountRows = await db.select().from(accounts);
  const transactionRows = await db.select().from(transactions);
  const billRows = await db.select().from(creditCardBills);
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
}
