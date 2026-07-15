import { Injectable } from "@nestjs/common";
import type { NetWorth } from "@vyaya/shared";

import { AccountRepository } from "../accounts/account.repository.js";
import { AssetRepository } from "./asset.repository.js";
import { ValuationRepository } from "./valuation.repository.js";

@Injectable()
export class NetWorthService {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly assets: AssetRepository,
    private readonly valuations: ValuationRepository
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
        valueMinor: value === undefined ? 0 : value.valueMinor,
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
