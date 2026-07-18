import type { HttpHandler } from "msw";

import { latestValuation } from "../data/store";
import type { MockHttp, MockStore } from "./types";

/** Mirrors apps/api net-worth.service.ts: sum of account balances + latest valuation per asset (0 if none). */
export function netWorthHandlers(http: MockHttp, store: MockStore): HttpHandler[] {
  return [
    http.get("/v1/net-worth", ({ response }) => {
      const accounts = store.accounts.map((account) => ({
        accountId: account.id,
        name: account.name,
        balanceMinor: account.balanceMinor
      }));
      const assets = store.assets.map((asset) => {
        const valuation = latestValuation(store, asset.id);
        return {
          assetId: asset.id,
          name: asset.name,
          kind: asset.kind,
          valueMinor: valuation === undefined ? 0 : valuation.valueMinor,
          valuedAt: valuation === undefined ? null : valuation.valuedAt
        };
      });

      const accountsMinor = accounts.reduce((sum, account) => sum + account.balanceMinor, 0);
      const assetsMinor = assets.reduce((sum, asset) => sum + asset.valueMinor, 0);

      return response(200).json({
        asOf: new Date().toISOString(),
        netWorthMinor: accountsMinor + assetsMinor,
        accounts,
        assets
      });
    })
  ];
}
