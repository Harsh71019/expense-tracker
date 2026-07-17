import type { ReactNode } from "react";

import { UploadForm } from "@/features/imports";

export default function NewImportPage(): ReactNode {
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Import a CSV</h1>
        <p className="mt-1.5 text-sm text-foreground-muted">
          Map your statement columns, then review every row before it reaches the ledger.
        </p>
      </div>
      <UploadForm />
    </section>
  );
}
