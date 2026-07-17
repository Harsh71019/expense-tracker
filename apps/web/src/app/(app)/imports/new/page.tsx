import type { ReactNode } from "react";

import { UploadForm } from "@/features/imports";

export default function NewImportPage(): ReactNode {
  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="font-mono text-xs tracking-widest text-foreground-muted uppercase">
          Statements
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">Import a CSV</h1>
        <p className="mt-2 text-sm text-foreground-muted">
          Map your statement columns, then review every row before it reaches the ledger.
        </p>
      </div>
      <UploadForm />
    </section>
  );
}
