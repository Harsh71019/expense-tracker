import type { ReactNode } from "react";

type BadgeVariant = "reversed" | "pending" | "duplicate" | "problem" | "success";

const variantClasses: Record<BadgeVariant, string> = {
  reversed: "border-reversed/30 bg-reversed/8 text-reversed",
  pending: "border-border bg-surface-muted/80 text-foreground-muted",
  duplicate: "border-reversed/30 bg-reversed/8 text-reversed",
  problem: "border-expense/30 bg-expense/10 text-expense",
  success: "border-income/30 bg-income/10 text-income"
};

export function Badge({
  children,
  variant
}: Readonly<{ children: ReactNode; variant: BadgeVariant }>): ReactNode {
  return (
    <span
      className={[
        "rounded-full border px-2.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider",
        variantClasses[variant]
      ].join(" ")}
    >
      {children}
    </span>
  );
}
