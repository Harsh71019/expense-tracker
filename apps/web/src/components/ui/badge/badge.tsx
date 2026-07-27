import type { ReactNode } from "react";

type BadgeVariant =
  "reversed" | "pending" | "duplicate" | "problem" | "success" | "accent" | "info";

const variantClasses: Record<BadgeVariant, string> = {
  reversed: "border-reversed/30 bg-reversed/8 text-reversed",
  pending: "border-border bg-surface-muted/80 text-foreground-muted",
  duplicate: "border-reversed/30 bg-reversed/8 text-reversed",
  problem: "border-expense/30 bg-expense/10 text-expense",
  success: "border-income/30 bg-income/10 text-income",
  accent: "border-accent/40 bg-accent-glow text-accent",
  info: "border-border/60 bg-surface-muted text-foreground-muted"
};

const pulseDotClasses: Record<BadgeVariant, string> = {
  reversed: "bg-reversed",
  pending: "bg-foreground-muted",
  duplicate: "bg-reversed",
  problem: "bg-expense",
  success: "bg-income",
  accent: "bg-accent",
  info: "bg-foreground-muted"
};

export function Badge({
  children,
  variant,
  pulse = false
}: Readonly<{ children: ReactNode; variant: BadgeVariant; pulse?: boolean }>): ReactNode {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider transition-colors",
        variantClasses[variant]
      ].join(" ")}
    >
      {pulse ? (
        <span
          className={`h-1.5 w-1.5 animate-pulse rounded-full ${pulseDotClasses[variant]}`}
          aria-hidden="true"
        />
      ) : null}
      {children}
    </span>
  );
}
