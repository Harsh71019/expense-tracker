import { accounts, transactions } from "../../../src/common/db/schema/index.js";
import type { DrizzleDb } from "../../../src/common/db/db.module.js";

export async function assertLedgerInvariants(db: DrizzleDb): Promise<void> {
  const accountRows = await db.select().from(accounts);
  const transactionRows = await db.select().from(transactions);
  const deltas = new Map<string, number>();
  const transferGroups = new Map<string, typeof transactionRows>();

  for (const transaction of transactionRows) {
    if (transaction.status === "posted" || transaction.status === "reversal") {
      const signed =
        transaction.type === "income" ? transaction.amountMinor : -transaction.amountMinor;
      deltas.set(transaction.accountId, (deltas.get(transaction.accountId) ?? 0) + signed);
    }
    if (transaction.transferGroupId !== null) {
      const group = transferGroups.get(transaction.transferGroupId) ?? [];
      group.push(transaction);
      transferGroups.set(transaction.transferGroupId, group);
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
