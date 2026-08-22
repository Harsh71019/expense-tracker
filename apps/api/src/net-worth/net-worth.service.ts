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
    // `AssetRepository.list()` already excludes a backfilled legacy
    // `loan_receivable` asset (plan doc §13.2, via NOT EXISTS on
    // receivables.legacy_asset_id) so it isn't counted on both sides of the
    // net-worth split. That exclusion is link-based, not kind-based: a
    // `loan_receivable` asset created with `openingValueMinor: 0` (via the
    // POST /assets compat adapter) has no linked receivable -- you can't
    // create a zero-amount `opening` event -- and remains a real,
    // legacy-only, still-live asset that a later valuation can update.
    // Filtering it out here by kind alone would silently drop that value
    // from net worth, so `allAssets` is used directly.
    const latest = await this.valuations.findLatestForAssets(
      userId,
      allAssets.map((asset) => asset.id)
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
    const netWorthAssets = allAssets.map((asset) => {
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
