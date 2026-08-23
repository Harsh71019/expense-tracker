import {
  deriveAssetCurrentPosition,
  type AssetPositionEventType,
  type PortfolioImportBatchId,
  type PortfolioImportRow
} from "@treasury-ops/shared";

import { AssetMarketRepository } from "../assets/asset-market.repository.js";
import { AssetRepository } from "../assets/asset.repository.js";
import type { DbTx } from "../common/db/db-txn.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";

type ReconciliationDependencies = Readonly<{
  assets: AssetRepository;
  market: AssetMarketRepository;
}>;

export async function appendPortfolioImportPositionEvent(
  dependencies: ReconciliationDependencies,
  userId: string,
  batchId: PortfolioImportBatchId,
  assetId: string,
  row: PortfolioImportRow,
  tx: DbTx
): Promise<void> {
  let quantityMicroUnits = row.quantityMicroUnits;
  if (quantityMicroUnits === null || quantityMicroUnits <= 0) return;

  let eventType: AssetPositionEventType;
  if (row.rowKind === "holding") {
    if ((await dependencies.assets.findOpenByIdForUpdate(userId, assetId, tx)) === null) {
      throw new EntityNotFoundError("Asset");
    }
    const currentPosition = deriveAssetCurrentPosition(
      assetId,
      await dependencies.market.listAllPositionEventsByAsset(userId, assetId, tx)
    );
    const reconciliation = determineReconciliation(
      currentPosition.quantityMicroUnits,
      quantityMicroUnits
    );
    if (reconciliation === null) return;
    eventType = reconciliation.eventType;
    quantityMicroUnits = reconciliation.quantityMicroUnits;
  } else {
    eventType = determineTransactionEventType(row.transactionType);
  }

  await dependencies.market.createPositionEvent(
    userId,
    {
      assetId,
      eventType,
      quantityMicroUnits,
      ...(row.rowKind === "transaction" && row.grossAmountMinor !== null
        ? { grossAmountMinor: row.grossAmountMinor }
        : {}),
      occurredAt: row.occurredAt ?? new Date(),
      source: "cas",
      sourceReference: `cas_batch_${batchId}_row_${row.rowNumber}`,
      portfolioImportRowId: row.id
    },
    tx
  );
}

function determineTransactionEventType(
  transactionType: string | null | undefined
): Extract<
  AssetPositionEventType,
  "purchase" | "reinvestment" | "switch_in" | "redemption" | "switch_out"
> {
  switch (transactionType) {
    case "redemption":
      return "redemption";
    case "switch_out":
      return "switch_out";
    case "switch_in":
      return "switch_in";
    case "reinvestment":
      return "reinvestment";
    default:
      return "purchase";
  }
}

function determineReconciliation(
  currentQuantityMicroUnits: number,
  targetQuantityMicroUnits: number
): Readonly<{
  eventType: Extract<AssetPositionEventType, "reconciliation_in" | "reconciliation_out">;
  quantityMicroUnits: number;
}> | null {
  const difference = BigInt(targetQuantityMicroUnits) - BigInt(currentQuantityMicroUnits);
  if (difference === 0n) return null;
  const absoluteDifference = difference < 0n ? -difference : difference;
  if (absoluteDifference > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("CAS reconciliation exceeds the supported unit range.");
  }
  return {
    eventType: difference > 0n ? "reconciliation_in" : "reconciliation_out",
    quantityMicroUnits: Number(absoluteDifference)
  };
}
