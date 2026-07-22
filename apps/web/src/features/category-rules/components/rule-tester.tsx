"use client";

import type { Category, CategoryRule } from "@treasury-ops/shared";
import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import { glyphFor, lighten } from "@/features/categories";

function dotStyle(color: string | undefined): CSSProperties | undefined {
  if (color === undefined) return undefined;
  return { background: `linear-gradient(145deg, ${lighten(color, 0.18)}, ${color})` };
}

type RuleTesterProps = Readonly<{
  rules: readonly CategoryRule[];
  categories: readonly Category[];
}>;

export function RuleTester({ rules, categories }: RuleTesterProps): ReactNode {
  const [testText, setTestText] = useState("");
  const query = testText.trim().toLowerCase();
  const active = query.length > 0;
  const matches = active ? rules.filter((rule) => query.includes(rule.pattern.toLowerCase())) : [];

  return (
    <div className="rounded-2xl border border-border bg-surface-elevated p-5">
      <p className="mb-2.5 font-mono text-[10.5px] font-semibold tracking-[1.2px] text-foreground-muted uppercase">
        Try it · type a description to see what would match
      </p>
      <input
        value={testText}
        onChange={(event) => setTestText(event.target.value)}
        placeholder="e.g. SWIGGY*ORDER 4821 BANGALORE"
        aria-label="Test a description against your rules"
        className="w-full rounded-[11px] border border-border bg-surface-muted px-3.5 py-3 font-mono text-sm text-foreground transition-colors duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
      />
      {active ? (
        <div className="mt-3.5 border-t border-border pt-3.5">
          {matches.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-sm text-foreground-muted">Would suggest</span>
              {matches.map((rule) => {
                const category = categories.find((item) => item.id === rule.categoryId);
                return (
                  <span
                    key={rule.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-muted py-1 pr-2.5 pl-1.5 text-[13px] font-semibold text-foreground"
                  >
                    <span
                      style={dotStyle(category?.color)}
                      className={`grid h-5 w-5 place-items-center rounded-full text-[11px] ${
                        category?.color === undefined
                          ? "bg-accent text-accent-foreground"
                          : "text-white"
                      }`}
                      aria-hidden="true"
                    >
                      {category === undefined ? "?" : glyphFor(category)}
                    </span>
                    {category?.name ?? "Unavailable category"}
                  </span>
                );
              })}
            </div>
          ) : (
            <span className="text-sm text-foreground-muted">
              No rule matches — this row would import uncategorized.
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}
