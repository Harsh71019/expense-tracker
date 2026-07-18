import type { ReactNode } from "react";

import { AssetManager } from "@/features/assets";
import { getAssets } from "@/features/assets/server/get-assets";
import { getNetWorth } from "@/features/net-worth/server/get-net-worth";

export default async function AssetsPage(): Promise<ReactNode> {
  const [assets, netWorth] = await Promise.all([getAssets(), getNetWorth()]);
  return <AssetManager initialAssets={assets} initialNetWorth={netWorth} />;
}
