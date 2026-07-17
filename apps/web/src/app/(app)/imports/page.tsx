import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { ImportBatchList, getImportBatches } from "@/features/imports";

export default async function ImportsPage(): Promise<ReactNode> {
  const batches = await getImportBatches();
  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs tracking-widest text-foreground-muted uppercase">
            Statements
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">Imports</h1>
        </div>
        <Link href="/imports/new">
          <Button>Import CSV</Button>
        </Link>
      </div>
      <ImportBatchList initialBatches={batches} />
    </section>
  );
}
