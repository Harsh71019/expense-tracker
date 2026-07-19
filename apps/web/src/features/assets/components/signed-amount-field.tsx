"use client";

import { parseMinor } from "@vyaya/shared";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

type SignedAmountFieldProps = Readonly<{
  id: string;
  label: string;
  hint?: string;
  allowNegative: boolean;
  negative: boolean;
  onToggleSign: () => void;
  magnitudeMinor: number;
  onChange: (magnitudeMinor: number) => void;
}>;

export function SignedAmountField({
  id,
  label,
  hint,
  allowNegative,
  negative,
  onToggleSign,
  magnitudeMinor,
  onChange
}: SignedAmountFieldProps): ReactNode {
  const [draft, setDraft] = useState(() => (magnitudeMinor / 100).toFixed(2));
  const [error, setError] = useState<string>();

  useEffect(() => {
    setDraft((magnitudeMinor / 100).toFixed(2));
  }, [magnitudeMinor]);

  function commit(): void {
    if (draft.trim() === "") {
      onChange(0);
      setError(undefined);
      return;
    }
    try {
      onChange(parseMinor(draft));
      setError(undefined);
    } catch (caught: unknown) {
      setError(caught instanceof RangeError ? caught.message : "Enter a valid amount.");
    }
  }

  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-xs font-semibold text-foreground">
        {label}
        {hint === undefined ? null : (
          <span className="ml-1 font-normal text-foreground-muted">{hint}</span>
        )}
      </label>
      <div className="flex items-center gap-2 rounded-[11px] border border-border bg-surface-muted py-1 pr-3.5 pl-2">
        {allowNegative ? (
          <button
            type="button"
            onClick={onToggleSign}
            aria-label={negative ? "Switch to positive" : "Switch to negative"}
            className={`grid h-8.5 w-9.5 shrink-0 place-items-center rounded-lg border border-border bg-surface font-mono text-base font-semibold ${
              negative ? "text-expense" : "text-accent"
            }`}
          >
            {negative ? "−" : "+"}
          </button>
        ) : null}
        <span className="font-mono text-lg text-foreground-muted">₹</span>
        <input
          id={id}
          value={draft}
          inputMode="decimal"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          placeholder="0.00"
          className="flex-1 bg-transparent py-3 font-mono text-lg font-semibold text-foreground outline-none"
        />
      </div>
      {error === undefined ? null : <p className="mt-1.5 text-xs text-expense">{error}</p>}
    </div>
  );
}
