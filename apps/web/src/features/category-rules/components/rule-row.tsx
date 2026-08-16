"use client";

import type { Category, CategoryRule } from "@treasury-ops/shared";
import type { CSSProperties, ReactNode } from "react";

import { glyphFor, IconGlyph, lighten } from "@/features/categories";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata"
});

function dotStyle(color: string | undefined): CSSProperties | undefined {
  if (color === undefined) return undefined;
  return { background: `linear-gradient(145deg, ${lighten(color, 0.18)}, ${color})` };
}

type RuleRowProps = Readonly<{
  rule: CategoryRule;
  category: Category | undefined;
  onDelete: (rule: CategoryRule) => void;
  onTestPattern?: ((pattern: string) => void) | undefined;
}>;

export function RuleRow({ rule, category, onDelete, onTestPattern }: RuleRowProps): ReactNode {
  const categoryName = category?.name ?? "Unavailable category";
  const kind = category?.kind ?? "expense";

  return (
    <div className="flex flex-col items-stretch justify-between gap-3.5 rounded-2xl border border-border/80 bg-surface-elevated p-4 shadow-xs transition-all duration-150 hover:border-accent/30 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
        <span className="rounded-md border border-border bg-surface-muted px-2 py-0.5 font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
          Contains
        </span>
        <span className="font-mono text-sm font-bold text-foreground">
          &quot;{rule.pattern}&quot;
        </span>
        <span className="font-mono text-sm text-accent" aria-hidden="true">
          →
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-surface-muted py-1 pr-3 pl-1.5 text-xs font-semibold text-foreground">
          <span
            style={dotStyle(category?.color)}
            className={`grid h-5 w-5 place-items-center overflow-hidden rounded-full text-2xs ${
              category?.color === undefined ? "bg-accent text-accent-foreground" : "text-white"
            }`}
            aria-hidden="true"
          >
            <IconGlyph value={category === undefined ? "?" : glyphFor(category)} size={11} />
          </span>
          <span>{categoryName}</span>
          <span
            className={`rounded-full border px-1.5 py-0.2 text-2xs font-extrabold uppercase ${
              kind === "income"
                ? "border-income/30 bg-income/10 text-income"
                : "border-expense/30 bg-expense/10 text-expense"
            }`}
          >
            {kind}
          </span>
        </span>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
        <span className="font-mono text-xs text-foreground-muted">
          Added {dateFormatter.format(rule.createdAt)}
        </span>

        {onTestPattern !== undefined ? (
          <button
            type="button"
            onClick={() => onTestPattern(rule.pattern)}
            title="Test in sandbox"
            aria-label={`Test rule ${rule.pattern}`}
            className="min-h-11 rounded-lg border border-border/80 bg-surface-muted/60 px-3 py-1.5 text-xs font-semibold text-foreground-muted transition-colors hover:border-accent/40 hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Test
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => onDelete(rule)}
          title="Delete rule"
          aria-label={`Delete rule containing ${rule.pattern}`}
          className="min-h-11 rounded-lg px-3 py-1.5 text-xs font-semibold text-expense transition-colors duration-150 hover:bg-expense/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-expense"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
