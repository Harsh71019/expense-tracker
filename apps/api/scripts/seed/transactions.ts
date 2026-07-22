import type { CreateTransaction, Transaction } from "@treasury-ops/shared";

import { withTxn } from "../../src/common/db/db-txn.js";
import type { SeededAccounts } from "./accounts.js";
import type { SeededCategories } from "./categories.js";
import type { SeedServices } from "./context.js";

export type SeededTransactions = Readonly<{
  reversedTransactionId: string;
  transferGroupId: string;
  reversedTransferGroupId: string;
  apiSourcedTransactionId: string;
}>;

/** `now`'s calendar day, `monthsBack` months earlier, clamped to the target month's last day. */
function monthsAgo(monthsBack: number, day: number): Date {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
  const lastDayOfMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDayOfMonth));
  target.setHours(12, 0, 0, 0);
  return target;
}

async function create(
  services: SeedServices,
  userId: string,
  input: CreateTransaction
): Promise<Transaction> {
  const result = await services.transactions.create(userId, input, undefined);
  return result.transaction;
}

/**
 * A realistic recurring pattern (salary, rent, utilities, groceries, dining,
 * transport, occasional shopping/interest) repeated across the last few
 * months plus the current one — enough volume per month for the reports
 * charts to look real rather than like three test fixtures.
 */
async function seedMonth(
  services: SeedServices,
  userId: string,
  accounts: SeededAccounts,
  categories: SeededCategories,
  monthsBack: number
): Promise<void> {
  await create(services, userId, {
    accountId: accounts.bank.id,
    categoryId: categories.salary.id,
    type: "income",
    amountMinor: 85_000_00,
    occurredAt: monthsAgo(monthsBack, 1),
    description: "Monthly salary",
    tags: ["salary"]
  });
  await create(services, userId, {
    accountId: accounts.bank.id,
    categoryId: categories.interest.id,
    type: "income",
    amountMinor: 420_00,
    occurredAt: monthsAgo(monthsBack, 3),
    description: "Savings account interest",
    tags: []
  });
  await create(services, userId, {
    accountId: accounts.bank.id,
    categoryId: categories.rent.id,
    type: "expense",
    amountMinor: 18_500_00,
    occurredAt: monthsAgo(monthsBack, 5),
    description: "Flat rent",
    tags: ["rent"]
  });
  await create(services, userId, {
    accountId: accounts.bank.id,
    categoryId: categories.utilities.id,
    type: "expense",
    amountMinor: 2_100_00,
    occurredAt: monthsAgo(monthsBack, 8),
    description: "Electricity + broadband bill",
    tags: ["utilities"]
  });
  await create(services, userId, {
    accountId: accounts.cash.id,
    categoryId: categories.groceries.id,
    type: "expense",
    amountMinor: 2_450_00,
    occurredAt: monthsAgo(monthsBack, 6),
    description: "BigBasket order",
    tags: ["groceries"]
  });
  await create(services, userId, {
    accountId: accounts.bank.id,
    categoryId: categories.groceries.id,
    type: "expense",
    amountMinor: 1_680_00,
    occurredAt: monthsAgo(monthsBack, 20),
    description: "DMart run",
    tags: ["groceries"]
  });
  await create(services, userId, {
    accountId: accounts.cash.id,
    categoryId: categories.diningOut.id,
    type: "expense",
    amountMinor: 780_00,
    occurredAt: monthsAgo(monthsBack, 12),
    description: "Dinner with friends",
    tags: []
  });
  await create(services, userId, {
    accountId: accounts.wallet.id,
    categoryId: categories.diningOut.id,
    type: "expense",
    amountMinor: 340_00,
    occurredAt: monthsAgo(monthsBack, 22),
    description: "Coffee and snacks",
    tags: []
  });
  await create(services, userId, {
    accountId: accounts.cash.id,
    categoryId: categories.transport.id,
    type: "expense",
    amountMinor: 620_00,
    occurredAt: monthsAgo(monthsBack, 14),
    description: "Auto and metro fares",
    tags: ["commute"]
  });
  await create(services, userId, {
    accountId: accounts.bank.id,
    categoryId: categories.shopping.id,
    type: "expense",
    amountMinor: 3_200_00,
    occurredAt: monthsAgo(monthsBack, 17),
    description: "Clothing purchase",
    tags: []
  });
}

async function seedApiSourcedTransaction(
  services: SeedServices,
  userId: string,
  accounts: SeededAccounts,
  categories: SeededCategories
): Promise<string> {
  const idempotencyKey = crypto.randomUUID();
  const input: CreateTransaction = {
    accountId: accounts.bank.id,
    categoryId: categories.salary.id,
    type: "income",
    amountMinor: 12_000_00,
    occurredAt: monthsAgo(0, 2),
    description: "Freelance payout via bank email parser",
    tags: ["api"]
  };

  const transaction = await withTxn(services.db, async (tx) => {
    const applied = await services.accounts.applyBalanceDelta(
      userId,
      input.accountId,
      input.amountMinor,
      tx
    );
    if (!applied) throw new Error("seedApiSourcedTransaction: account not found.");

    const created = await services.transactionsRepo.create(
      userId,
      input,
      idempotencyKey,
      tx,
      undefined,
      "api"
    );
    await services.audit.record(userId, "transaction.create", created.id, tx);
    return created;
  });

  return transaction.id;
}

export async function seedFullTransactions(
  services: SeedServices,
  userId: string,
  accounts: SeededAccounts,
  categories: SeededCategories
): Promise<SeededTransactions> {
  for (const monthsBack of [3, 2, 1, 0]) {
    await seedMonth(services, userId, accounts, categories, monthsBack);
  }

  const toReverse = await create(services, userId, {
    accountId: accounts.bank.id,
    categoryId: categories.shopping.id,
    type: "expense",
    amountMinor: 4_500_00,
    occurredAt: monthsAgo(0, 9),
    description: "Refunded electronics purchase",
    tags: []
  });
  const reversal = await services.transactions.reverse(userId, toReverse.id);

  const transfer = await services.transfers.create(
    userId,
    {
      fromAccountId: accounts.bank.id,
      toAccountId: accounts.cash.id,
      amountMinor: 5_000_00,
      occurredAt: monthsAgo(0, 4),
      description: "ATM withdrawal",
      tags: []
    },
    undefined
  );

  const transferToReverse = await services.transfers.create(
    userId,
    {
      fromAccountId: accounts.bank.id,
      toAccountId: accounts.wallet.id,
      amountMinor: 1_000_00,
      occurredAt: monthsAgo(0, 11),
      description: "Wallet top-up (accidental)",
      tags: []
    },
    undefined
  );
  const transferReversal = await services.transfers.reverse(
    userId,
    transferToReverse.transferGroupId
  );

  const apiSourcedTransactionId = await seedApiSourcedTransaction(
    services,
    userId,
    accounts,
    categories
  );

  return {
    reversedTransactionId: reversal.transaction.id,
    transferGroupId: transfer.transferGroupId,
    reversedTransferGroupId: transferReversal.transferGroupId,
    apiSourcedTransactionId
  };
}

/** Light dataset — a handful of transactions, no transfers/reversals needed. */
export async function seedLightTransactions(
  services: SeedServices,
  userId: string,
  accounts: Readonly<{ cash: { id: string } }>,
  categories: Readonly<{ groceries: { id: string }; salary: { id: string } }>
): Promise<void> {
  await create(services, userId, {
    accountId: accounts.cash.id,
    categoryId: categories.salary.id,
    type: "income",
    amountMinor: 30_000_00,
    occurredAt: monthsAgo(0, 1),
    description: "Salary",
    tags: []
  });
  await create(services, userId, {
    accountId: accounts.cash.id,
    categoryId: categories.groceries.id,
    type: "expense",
    amountMinor: 900_00,
    occurredAt: monthsAgo(0, 10),
    description: "Groceries",
    tags: []
  });
}
