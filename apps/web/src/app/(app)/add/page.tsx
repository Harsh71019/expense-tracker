import type { ReactNode } from "react";
import Link from "next/link";

import { QuickAddForm } from "@/features/quick-add";

export default function AddTransactionPage(): ReactNode {
  return (
    <div className="space-y-5">
      <div className="flex justify-stretch sm:justify-end">
        <Link
          href="/transfers"
          className="flex min-h-11 w-full touch-manipulation items-center justify-center rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm font-semibold transition-colors hover:border-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:w-auto"
        >
          Transfer between accounts
        </Link>
      </div>
      <QuickAddForm />
    </div>
  );
}
