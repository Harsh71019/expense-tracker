import type { BillDetail } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { actionLabel, nextBillAction } from "../model/bill-presentation";

const steps = ["Statement", "Review", "Reconciled", "Paid"] as const;

function completedCount(detail: BillDetail): number {
  if (detail.bill.paymentStatus === "paid") return 4;
  if (detail.bill.reconciliationStatus === "reconciled") return 3;
  if (detail.activeStatement?.status === "staged") return 2;
  if (detail.activeStatement !== undefined) return 1;
  return 0;
}

export function BillLifecycle({ detail }: Readonly<{ detail: BillDetail }>): ReactNode {
  const completed = completedCount(detail);
  const action = nextBillAction(detail);
  return (
    <section className="rounded-2xl border border-border bg-surface-elevated p-5">
      <div className="flex items-center justify-between gap-2">
        {steps.map((step, index) => {
          const done = index < completed;
          const current = index === completed && completed < steps.length;
          return (
            <div key={step} className="flex min-w-0 flex-1 items-center gap-2">
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-bold ${
                  done
                    ? "border-accent bg-accent text-accent-foreground"
                    : current
                      ? "border-accent bg-accent-glow text-accent"
                      : "border-border bg-surface-muted text-foreground-muted"
                }`}
              >
                {done ? "✓" : index + 1}
              </span>
              <span className="hidden truncate text-xs font-semibold text-foreground sm:block">
                {step}
              </span>
              {index === steps.length - 1 ? null : (
                <span className={`h-px flex-1 ${done ? "bg-accent" : "bg-border"}`} />
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-sm text-foreground-muted">
        Current action: <span className="font-semibold text-foreground">{actionLabel[action]}</span>
      </p>
    </section>
  );
}
