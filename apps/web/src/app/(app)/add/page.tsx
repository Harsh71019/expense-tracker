import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { PageShell } from "@/components/ui/page-shell";
import { QuickAddForm } from "@/features/quick-add";

export default function AddTransactionPage(): ReactNode {
  return (
    <PageShell width="narrow" className="animate-fade-in">
      <PageHeader
        eyebrow="Ledger / add"
        title="Add transaction"
        description="Capture it while it's fresh — every save is idempotent and lands straight in the ledger."
        action={
          <Link
            href="/transfers"
            className="flex min-h-11 w-full touch-manipulation items-center justify-center gap-2 rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm font-semibold transition-colors hover:border-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:w-auto"
          >
            <ArrowLeftRight size={16} className="shrink-0" aria-hidden="true" />
            Transfer between accounts
          </Link>
        }
      />
      <QuickAddForm />
    </PageShell>
  );
}
