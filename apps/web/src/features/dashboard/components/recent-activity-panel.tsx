import type { RecentActivityItem } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { Money } from "@/components/ui/money";
import { EmptyState } from "@/components/ui/empty-state";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  timeZone: "Asia/Kolkata"
});

type RecentActivityPanelProps = Readonly<{ items: RecentActivityItem[] }>;

export function RecentActivityPanel({ items }: RecentActivityPanelProps): ReactNode {
  return (
    <div className="rounded-2xl border border-border bg-surface-elevated p-5.5">
      <h2 className="mb-4 text-base font-bold tracking-tight text-foreground">Recent activity</h2>
      {items.length === 0 ? (
        <EmptyState title="No transactions yet" description="Log your first one from Quick add." />
      ) : (
        <div className="flex flex-col gap-0.5">
          {items.map((item) => {
            const isIncome = item.type === "income";
            return (
              <div key={item.id} className="flex items-center gap-3 rounded-xl px-2 py-2">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${isIncome ? "bg-income" : "bg-foreground-muted"}`}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {item.description}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-foreground-muted">
                    {item.accountName} · {dateFormatter.format(item.occurredAt)}
                  </p>
                </div>
                <Money
                  minor={item.amountMinor}
                  variant={isIncome ? "income" : "expense"}
                  signed
                  size="sm"
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
