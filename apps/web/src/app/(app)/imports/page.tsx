import type { ReactNode } from "react";

import { ImportWizard, getImportBatches } from "@/features/imports";

export default async function ImportsPage(): Promise<ReactNode> {
  const batches = await getImportBatches();
  return <ImportWizard initialBatches={batches} />;
}
