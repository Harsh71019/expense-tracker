import { Injectable } from "@nestjs/common";
import type { NetWorth } from "@treasury-ops/shared";

import { AccountRepository } from "../accounts/account.repository.js";
import { AssetRepository } from "../assets/asset.repository.js";
import { ValuationRepository } from "../assets/valuation.repository.js";
import { AssetFundingRepository } from "../asset-fundings/asset-funding.repository.js";
import { ReceivableNetWorthReadService } from "../receivables/receivable-net-worth-read.service.js";

@Injectable()
export class NetWorthService {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly assets: AssetRepository,
    private readonly valuations: ValuationRepository,
    private readonly fundings: AssetFundingRepository,
    private readonly receivablesRead: ReceivableNetWorthReadService
  ) {}

  async get(userId: string): Promise<NetWorth> {
    const [accounts, allAssets, receivables] = await Promise.all([
      this.accounts.list(userId),
      this.assets.list(userId),
      this.receivablesRead.listActive(userId)
    ]);
    // A backfilled legacy `loan_receivable` asset is represented by its
    // migrated receivable instead (plan doc §13.2) -- excluded here so it
    // isn't counted on both sides of the net-worth split.
    const nonReceivableAssets = allAssets.filter((asset) => asset.kind !== "loan_receivable");
    const latest = await this.valuations.findLatestForAssets(
      userId,
      nonReceivableAssets.map((asset) => asset.id)
    );

    const activeFundings = await this.fundings.listActiveForAssets(
      userId,
      allAssets.map((asset) => asset.id)
    );
    const contributedAfterLatest = new Map<string, number>();
    for (const funding of activeFundings) {
      const valuation = latest.get(funding.assetId);
      if (valuation !== undefined && funding.occurredAt <= valuation.valuedAt) continue;
      contributedAfterLatest.set(
        funding.assetId,
        (contributedAfterLatest.get(funding.assetId) ?? 0) + funding.amountMinor
      );
    }
    const netWorthAccounts = accounts.map((account) => ({
      accountId: account.id,
      name: account.name,
      balanceMinor: account.balanceMinor
    }));
    const netWorthAssets = nonReceivableAssets.map((asset) => {
      const value = latest.get(asset.id);
      return {
        assetId: asset.id,
        name: asset.name,
        kind: asset.kind,
        valueMinor:
          (value === undefined ? 0 : value.valueMinor) +
          (contributedAfterLatest.get(asset.id) ?? 0),
        valuedAt: value === undefined ? null : value.valuedAt
      };
    });

    const accountsMinor = netWorthAccounts.reduce((sum, account) => sum + account.balanceMinor, 0);
    const assetsMinor = netWorthAssets.reduce((sum, asset) => sum + asset.valueMinor, 0);
    const receivablesMinor = receivables.reduce((sum, r) => sum + r.outstandingMinor, 0);

    return {
      asOf: new Date(),
      netWorthMinor: accountsMinor + assetsMinor + receivablesMinor,
      accounts: netWorthAccounts,
      assets: netWorthAssets,
      receivables
    };
  }
}
