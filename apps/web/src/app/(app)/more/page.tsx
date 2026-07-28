import Link from "next/link";
import type { ReactNode } from "react";

import { mainNavItems } from "@/components/app-nav";

export default function MorePage(): ReactNode {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-foreground">More</h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Every section of TreasuryOps, in one place.
        </p>
      </div>

      <nav aria-label="All sections" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {mainNavItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex flex-col items-start gap-2 rounded-xl border border-border bg-surface-elevated p-4 transition-colors duration-150 hover:border-accent/40 hover:bg-surface-muted/60"
          >
            <span
              className="grid h-9 w-9 place-items-center rounded-lg bg-accent-glow text-lg text-accent"
              aria-hidden="true"
            >
              {item.icon}
            </span>
            <span className="text-sm font-semibold text-foreground">{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
