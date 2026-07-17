import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { ImportBatchList, getImportBatches } from "@/features/imports";

export default async function ImportsPage(): Promise<ReactNode> {
  const batches = await getImportBatches();
  return (
    <section className="space-y-6">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Imports</h1>
        <Link href="/imports/new">
          <Button>Import CSV</Button>
        </Link>
      </div>
      <ImportBatchList initialBatches={batches} />
    </section>
  );
}
