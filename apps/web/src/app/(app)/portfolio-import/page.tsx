import type { ReactNode } from "react";

import { getAssets } from "@/features/assets/server/get-assets";
import { PortfolioImportWizard } from "@/features/portfolio-imports";

export default async function PortfolioImportPage(): Promise<ReactNode> {
  const assets = await getAssets();
  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <PortfolioImportWizard userAssets={assets} />
    </main>
  );
}
