import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { AssetDetail } from "@/features/assets";
import { getAssets } from "@/features/assets/server/get-assets";
import { getValuations } from "@/features/assets/server/get-valuations";

export default async function AssetDetailPage({
  params
}: {
  params: Promise<{ assetId: string }>;
}): Promise<ReactNode> {
  const { assetId } = await params;
  const [assets, valuations] = await Promise.all([getAssets(), getValuations(assetId)]);
  const asset = assets.find((item) => item.id === assetId);
  if (asset === undefined || valuations === null) notFound();
  return <AssetDetail asset={asset} initialValuations={valuations} />;
}
