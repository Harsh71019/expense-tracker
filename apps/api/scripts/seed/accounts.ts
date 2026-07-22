import type { Account } from "@vyaya/shared";

import { withTxn } from "../../src/common/db/db-txn.js";
import type { SeedServices } from "./context.js";

export type SeededAccounts = Readonly<{
  bank: Account;
  creditCard: Account;
  cash: Account;
  wallet: Account;
  investment: Account;
  archivedWallet: Account;
}>;

/** One of every AccountType (SEEDING-PLAN.md §2) plus one archived account. */
export async function seedFullAccounts(
  services: SeedServices,
  userId: string
): Promise<SeededAccounts> {
  const [bank, creditCard, cash, wallet, investment, archivedWallet] = await withTxn(
    services.db,
    (tx) =>
      Promise.all([
        services.accounts.create(
          userId,
          { name: "HDFC Bank", type: "bank", openingBalanceMinor: 5_00_000_00 },
          tx
        ),
        services.accounts.create(
          userId,
          { name: "HDFC Millennia Credit Card", type: "credit_card", openingBalanceMinor: 0 },
          tx
        ),
        services.accounts.create(
          userId,
          { name: "Cash", type: "cash", openingBalanceMinor: 5_000_00 },
          tx
        ),
        services.accounts.create(
          userId,
          { name: "Paytm Wallet", type: "wallet", openingBalanceMinor: 1_500_00 },
          tx
        ),
        services.accounts.create(
          userId,
          { name: "Zerodha", type: "investment", openingBalanceMinor: 2_00_000_00 },
          tx
        ),
        services.accounts.create(
          userId,
          { name: "Old Freecharge Wallet", type: "wallet", openingBalanceMinor: 100_00 },
          tx
        )
      ])
  );

  await services.accounts.archive(userId, archivedWallet.id);

  return { bank, creditCard, cash, wallet, investment, archivedWallet };
}

/** Light dataset for the secondary tenant-isolation-check user (SEEDING-PLAN.md §3). */
export async function seedLightAccounts(
  services: SeedServices,
  userId: string
): Promise<Readonly<{ cash: Account }>> {
  const cash = await withTxn(services.db, (tx) =>
    services.accounts.create(
      userId,
      { name: "Cash", type: "cash", openingBalanceMinor: 2_000_00 },
      tx
    )
  );
  return { cash };
}
