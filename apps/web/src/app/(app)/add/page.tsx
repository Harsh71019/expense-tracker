import type { ReactNode } from "react";
import Link from "next/link";

import { QuickAddForm } from "@/features/quick-add";

export default function AddTransactionPage(): ReactNode {
  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Link
          href="/transfers"
          className="rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm font-semibold transition-colors hover:border-accent/40"
        >
          Transfer between accounts
        </Link>
      </div>
      <QuickAddForm />
    </div>
  );
}
