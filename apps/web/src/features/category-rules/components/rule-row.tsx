"use client";

import type { Category, CategoryRule } from "@vyaya/shared";
import type { CSSProperties, ReactNode } from "react";

import { glyphFor, lighten } from "@/features/categories";

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
}>;

export function RuleRow({ rule, category, onDelete }: RuleRowProps): ReactNode {
  const categoryName = category?.name ?? "Unavailable category";
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-[13px] border border-border bg-surface-elevated px-4.5 py-3.5 animate-fade-in">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
        <span className="rounded-[5px] border border-border bg-surface-muted px-1.5 py-0.5 font-mono text-[9.5px] font-semibold tracking-wider text-foreground-muted uppercase">
          Contains
        </span>
        <span className="font-mono text-[15px] text-foreground">&quot;{rule.pattern}&quot;</span>
        <span className="font-mono text-[15px] text-accent">→</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-muted py-1 pr-2.5 pl-1.5 text-[13px] font-semibold text-foreground">
          <span
            style={dotStyle(category?.color)}
            className={`grid h-5 w-5 place-items-center rounded-full text-[11px] ${
              category?.color === undefined ? "bg-accent text-accent-foreground" : "text-white"
            }`}
            aria-hidden="true"
          >
            {category === undefined ? "?" : glyphFor(category)}
          </span>
          {categoryName}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-3.5">
        <span className="font-mono text-xs whitespace-nowrap text-foreground-muted">
          Added {dateFormatter.format(rule.createdAt)}
        </span>
        <button
          type="button"
          onClick={() => onDelete(rule)}
          title="Delete rule"
          className="rounded-md px-1.5 py-1 text-sm font-medium text-expense transition-colors duration-150 hover:bg-expense/10"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
