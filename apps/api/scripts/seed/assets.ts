import type { Asset } from "@vyaya/shared";

import type { SeedServices } from "./context.js";

export type SeededAssets = Readonly<{
  loanReceivable: Asset;
  loanLiability: Asset;
  fixedDeposit: Asset;
  gold: Asset;
  silver: Asset;
  investment: Asset;
}>;

function monthsAgoDate(monthsBack: number): Date {
  const date = new Date();
  date.setMonth(date.getMonth() - monthsBack);
  return date;
}

/**
 * One of every AssetKind (SEEDING-PLAN.md §2), respecting CreateAssetSchema's
 * per-kind constraints (maturityAt/annualRateBps only for fixed_deposit,
 * quantityMilliUnits only for gold/silver, only loan_liability may be
 * negative) — plus a follow-up valuation on the investment asset and the
 * loan_receivable closed out as fully repaid.
 */
export async function seedFullAssets(
  services: SeedServices,
  userId: string
): Promise<SeededAssets> {
  const loanReceivable = await services.assets.create(userId, {
    kind: "loan_receivable",
    name: "Loan to a friend",
    openedAt: monthsAgoDate(8),
    openingValueMinor: 25_000_00
  });

  const loanLiability = await services.assets.create(userId, {
    kind: "loan_liability",
    name: "Personal loan from Dad",
    openedAt: monthsAgoDate(10),
    openingValueMinor: -1_50_000_00
  });

  const fixedDeposit = await services.assets.create(userId, {
    kind: "fixed_deposit",
    name: "HDFC 1-year FD",
    openedAt: monthsAgoDate(6),
    maturityAt: monthsAgoDate(-6),
    annualRateBps: 725,
    openingValueMinor: 3_00_000_00
  });

  const gold = await services.assets.create(userId, {
    kind: "gold",
    name: "Gold jewelry",
    openedAt: monthsAgoDate(24),
    quantityMilliUnits: 50_000,
    openingValueMinor: 3_25_000_00
  });

  const silver = await services.assets.create(userId, {
    kind: "silver",
    name: "Silver coins",
    openedAt: monthsAgoDate(18),
    quantityMilliUnits: 500_000,
    openingValueMinor: 45_000_00
  });

  const investment = await services.assets.create(userId, {
    kind: "investment",
    name: "Index fund SIP",
    openedAt: monthsAgoDate(12),
    openingValueMinor: 1_80_000_00
  });
  await services.assets.addValuation(userId, investment.id, {
    valueMinor: 2_05_000_00,
    valuedAt: monthsAgoDate(0),
    source: "manual"
  });

  await services.assets.close(userId, loanReceivable.id);

  return { loanReceivable, loanLiability, fixedDeposit, gold, silver, investment };
}
