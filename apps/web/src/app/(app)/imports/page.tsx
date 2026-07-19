import dynamic from "next/dynamic";
import type { ReactNode } from "react";

import { getImportBatches } from "@/features/imports/server/get-import-batches";

const ImportWizard = dynamic(() =>
  import("@/features/imports/components/import-wizard").then(
    (importsFeature) => importsFeature.ImportWizard
  )
);

export default async function ImportsPage(): Promise<ReactNode> {
  const batches = await getImportBatches();
  return <ImportWizard initialBatches={batches} />;
}
