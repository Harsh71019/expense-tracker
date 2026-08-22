import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { AssetDetail, getAsset, getMarketRates, getValuations } from "@/features/assets";

export default async function AssetDetailPage({
  params
}: Readonly<{ params: Promise<{ assetId: string }> }>): Promise<ReactNode> {
  const { assetId } = await params;
  const [asset, valuations, marketRates] = await Promise.all([
    getAsset(assetId),
    getValuations(assetId),
    getMarketRates()
  ]);

  if (asset === null) {
    notFound();
  }

  return (
    <AssetDetail
      initialAsset={asset}
      initialValuations={valuations}
      initialMarketRates={marketRates}
    />
  );
}
