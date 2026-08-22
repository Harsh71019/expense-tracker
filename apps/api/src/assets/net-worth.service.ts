import { Injectable } from "@nestjs/common";
import type { NetWorth } from "@treasury-ops/shared";

import { AccountRepository } from "../accounts/account.repository.js";
import { AssetRepository } from "./asset.repository.js";
import { ValuationRepository } from "./valuation.repository.js";
import { AssetFundingRepository } from "../asset-fundings/asset-funding.repository.js";

@Injectable()
export class NetWorthService {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly assets: AssetRepository,
    private readonly valuations: ValuationRepository,
    private readonly fundings: AssetFundingRepository
  ) {}

  async get(userId: string): Promise<NetWorth> {
    const [accounts, assets] = await Promise.all([
      this.accounts.list(userId),
      this.assets.list(userId)
    ]);
    const latest = await this.valuations.findLatestForAssets(
      userId,
      assets.map((asset) => asset.id)
    );

    const activeFundings = await this.fundings.listActiveForAssets(
      userId,
      assets.map((asset) => asset.id)
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
    const netWorthAssets = assets.map((asset) => {
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

    return {
      asOf: new Date(),
      netWorthMinor: accountsMinor + assetsMinor,
      accounts: netWorthAccounts,
      assets: netWorthAssets
    };
  }
}
