import { createHash } from "node:crypto";

import { Injectable } from "@nestjs/common";
import type {
  Asset,
  AssetMarketLink,
  MarketInstrumentType,
  PortfolioImportRowAction,
  PortfolioImportRowMatchStatus
} from "@treasury-ops/shared";

import type { ParsedCasRow } from "./kfintech-cams-cas-parser.js";

export type StagedCasRowInput = Readonly<{
  rowNumber: number;
  rowKind: "holding" | "transaction";
  semanticFingerprint: string;
  instrumentType: MarketInstrumentType;
  isin?: string | undefined;
  schemeCode?: string | undefined;
  displayName: string;
  folioReferenceMasked?: string | undefined;
  transactionType?: string | undefined;
  occurredAt?: Date | undefined;
  quantityMicroUnits: number;
  grossAmountMinor?: number | undefined;
  navMicroRupeesPerUnit?: number | undefined;
  proposedAssetId?: string | undefined;
  matchStatus: PortfolioImportRowMatchStatus;
  proposedAction: PortfolioImportRowAction;
  include: boolean;
  warningCode?: string | undefined;
}>;

@Injectable()
export class PortfolioImportMatcherService {
  matchRows(
    rows: readonly ParsedCasRow[],
    existingAssets: readonly Asset[],
    existingLinks: readonly AssetMarketLink[]
  ): StagedCasRowInput[] {
    const assetsById = new Map(existingAssets.map((asset) => [asset.id, asset]));
    const linksByAssetId = new Map(existingLinks.map((link) => [link.assetId, link]));

    return rows.map((row, index) => {
      const match = this.findBestMatch(row, existingAssets, linksByAssetId, assetsById);
      const fingerprint = computeSemanticFingerprint(row);

      return {
        rowNumber: index + 1,
        rowKind: row.rowKind,
        semanticFingerprint: fingerprint,
        instrumentType: "mutual_fund",
        isin: row.isin,
        schemeCode: undefined, // Scheme code may be populated if known, or left undefined
        displayName: row.displayName,
        folioReferenceMasked: row.folioReferenceMasked,
        transactionType: row.transactionType,
        occurredAt: row.occurredAt,
        quantityMicroUnits: row.quantityMicroUnits,
        grossAmountMinor: row.grossAmountMinor,
        navMicroRupeesPerUnit: row.navMicroRupeesPerUnit,
        proposedAssetId: match.assetId,
        matchStatus: match.status,
        proposedAction: match.action ?? row.proposedAction,
        include: true,
        warningCode: match.warningCode
      };
    });
  }

  private findBestMatch(
    row: ParsedCasRow,
    existingAssets: readonly Asset[],
    linksByAssetId: ReadonlyMap<string, AssetMarketLink>,
    assetsById: ReadonlyMap<string, Asset>
  ): Readonly<{
    assetId?: string | undefined;
    status: PortfolioImportRowMatchStatus;
    action?: PortfolioImportRowAction | undefined;
    warningCode?: string | undefined;
  }> {
    // 1. Exact ISIN match
    if (row.isin !== undefined) {
      for (const [assetId, link] of linksByAssetId.entries()) {
        if (link.isin?.toUpperCase() === row.isin.toUpperCase()) {
          const asset = assetsById.get(assetId);
          if (asset !== undefined && !asset.isClosed) {
            return {
              assetId: asset.id,
              status: "matched",
              action: row.rowKind === "holding" ? "reconcile" : "append_event"
            };
          }
        }
      }
    }

    // 2. Exact scheme code match (if present on link)
    // 3. Provider instrument ID match
    if (row.isin !== undefined) {
      for (const [assetId, link] of linksByAssetId.entries()) {
        if (link.providerInstrumentId.toUpperCase() === row.isin.toUpperCase()) {
          const asset = assetsById.get(assetId);
          if (asset !== undefined && !asset.isClosed) {
            return {
              assetId: asset.id,
              status: "matched",
              action: row.rowKind === "holding" ? "reconcile" : "append_event"
            };
          }
        }
      }
    }

    // 4. Normalized name candidate matching
    const normalizedTargetName = normalizeSchemeName(row.displayName);
    for (const asset of existingAssets) {
      if (asset.isClosed || asset.kind !== "investment") continue;
      const normalizedAssetName = normalizeSchemeName(asset.name);
      if (
        normalizedTargetName === normalizedAssetName ||
        (normalizedTargetName.length > 5 &&
          (normalizedTargetName.includes(normalizedAssetName) ||
            normalizedAssetName.includes(normalizedTargetName)))
      ) {
        return {
          assetId: asset.id,
          status: "needs_confirmation",
          action: row.rowKind === "holding" ? "reconcile" : "append_event",
          warningCode: "name_match_only"
        };
      }
    }

    // 5. Unmatched
    return {
      status: "unmatched",
      action: "create_asset"
    };
  }
}

function normalizeSchemeName(name: string): string {
  return name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]/gu, " ")
    .replaceAll(/\s+/gu, " ")
    .trim();
}

function computeSemanticFingerprint(row: ParsedCasRow): string {
  const hash = createHash("sha256");
  hash.update(row.isin ?? "");
  hash.update("|");
  hash.update(row.folioReferenceMasked);
  hash.update("|");
  hash.update(row.rowKind);
  hash.update("|");
  hash.update(row.transactionType ?? "");
  hash.update("|");
  hash.update(row.occurredAt?.toISOString() ?? "");
  hash.update("|");
  hash.update(String(row.quantityMicroUnits));
  hash.update("|");
  hash.update(String(row.grossAmountMinor ?? ""));
  hash.update("|");
  hash.update(row.displayName);
  return hash.digest("hex");
}
