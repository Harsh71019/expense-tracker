"use client";

import type { Category, CategoryRule } from "@treasury-ops/shared";
import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import { glyphFor, IconGlyph, lighten } from "@/features/categories";

function dotStyle(color: string | undefined): CSSProperties | undefined {
  if (color === undefined) return undefined;
  return { background: `linear-gradient(145deg, ${lighten(color, 0.18)}, ${color})` };
}

const SAMPLE_DESCRIPTIONS = [
  "SWIGGY*ORDER 4821",
  "AMZN MKTP IN RETAIL",
  "UBER INDIA TRIP 8892",
  "NETFLIX DIGITAL SUBSCRIPTION",
  "SALARY CREDIT ACME CORP"
] as const;

type RuleTesterProps = Readonly<{
  rules: readonly CategoryRule[];
  categories: readonly Category[];
  initialValue?: string | undefined;
}>;

export function RuleTester({ rules, categories, initialValue = "" }: RuleTesterProps): ReactNode {
  const [testText, setTestText] = useState(initialValue);

  useEffect(() => {
    if (initialValue !== "") {
      setTestText(initialValue);
    }
  }, [initialValue]);

  const query = testText.trim().toLowerCase();
  const active = query.length > 0;
  const matches = active ? rules.filter((rule) => query.includes(rule.pattern.toLowerCase())) : [];
  const primaryMatch = matches[0];
  const primaryCategory =
    primaryMatch !== undefined
      ? categories.find((item) => item.id === primaryMatch.categoryId)
      : undefined;

  function renderHighlightedText(text: string, matchedPattern: string): ReactNode {
    const idx = text.toLowerCase().indexOf(matchedPattern.toLowerCase());
    if (idx === -1) return text;
    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + matchedPattern.length);
    const after = text.slice(idx + matchedPattern.length);
    return (
      <span>
        {before}
        <mark className="rounded bg-accent/25 px-1 py-0.5 font-bold text-accent">{match}</mark>
        {after}
      </span>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface-elevated p-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-lg bg-accent/10 text-xs text-accent">
            ⚡
          </span>
          <p className="font-mono text-[10.5px] font-bold tracking-[1.2px] text-foreground-muted uppercase">
            Interactive Rule Tester
          </p>
        </div>
        <span className="text-[11px] text-foreground-muted">
          Type or click a sample to simulate import matching
        </span>
      </div>

      <div className="mt-3 relative">
        <input
          name="ruleTestDescription"
          autoComplete="off"
          value={testText}
          onChange={(event) => setTestText(event.target.value)}
          placeholder="e.g. SWIGGY*ORDER 4821 BANGALORE…"
          aria-label="Test a description against your rules"
          className="min-h-11 w-full rounded-xl border border-border bg-surface-muted px-3.5 py-3 font-mono text-base text-foreground transition-colors duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 sm:text-sm"
        />
        {testText !== "" ? (
          <button
            type="button"
            onClick={() => setTestText("")}
            aria-label="Clear test description"
            className="absolute right-3 top-1/2 -translate-y-1/2 grid h-7 w-7 place-items-center rounded-lg text-xs text-foreground-muted hover:bg-surface-elevated hover:text-foreground"
          >
            ✕
          </button>
        ) : null}
      </div>

      {/* Quick Sample Chips */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-foreground-muted">
          Try Samples:
        </span>
        {SAMPLE_DESCRIPTIONS.map((sample) => (
          <button
            key={sample}
            type="button"
            onClick={() => setTestText(sample)}
            className="rounded-lg border border-border/80 bg-surface-muted/60 px-2.5 py-1 font-mono text-xs text-foreground-muted transition-colors hover:border-accent/50 hover:bg-surface-muted hover:text-foreground"
          >
            {sample}
          </button>
        ))}
      </div>

      {active ? (
        <div className="mt-4 border-t border-border/80 pt-4">
          {matches.length > 0 && primaryMatch !== undefined ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium text-foreground-muted">Would suggest</span>
                <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-muted py-1.5 pr-3 pl-2 text-sm font-bold text-foreground shadow-xs">
                  <span
                    style={dotStyle(primaryCategory?.color)}
                    className={`grid h-6 w-6 place-items-center overflow-hidden rounded-full text-xs ${
                      primaryCategory?.color === undefined
                        ? "bg-accent text-accent-foreground"
                        : "text-white"
                    }`}
                    aria-hidden="true"
                  >
                    <IconGlyph
                      value={primaryCategory === undefined ? "?" : glyphFor(primaryCategory)}
                      size={13}
                    />
                  </span>
                  <span>{primaryCategory?.name ?? "Unavailable category"}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                      primaryCategory?.kind === "income"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {primaryCategory?.kind ?? "expense"}
                  </span>
                </span>
                <span className="text-xs text-foreground-muted">
                  via matched rule{" "}
                  <code className="font-mono font-bold text-accent">
                    &quot;{primaryMatch.pattern}&quot;
                  </code>
                </span>
              </div>

              {/* Match Details Breakdown */}
              <div className="rounded-xl border border-border/70 bg-surface-muted/40 p-3 text-xs">
                <span className="font-mono font-semibold text-foreground-muted">
                  Matched Narration:{" "}
                </span>
                <span className="font-mono text-foreground">
                  {renderHighlightedText(testText, primaryMatch.pattern)}
                </span>
              </div>

              {/* Overlapping matches notification */}
              {matches.length > 1 ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
                  <span className="font-semibold">⚠️ Multi-rule match:</span> {matches.length} rules
                  match this description ({matches.map((m) => `"${m.pattern}"`).join(", ")}). The
                  top rule{" "}
                  <code className="font-mono font-bold">&quot;{primaryMatch.pattern}&quot;</code>{" "}
                  takes precedence during import.
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-foreground-muted">
              <span className="text-amber-500 font-semibold" aria-hidden="true">
                ⓘ
              </span>
              <span>No rule matches — this row would import uncategorized.</span>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
