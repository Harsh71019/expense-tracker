"use client";

import { formatMinor, parseMinor } from "@treasury-ops/shared";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

type AmountInputProps = Readonly<{
  id: string;
  label: string;
  value: number;
  onChange: (minor: number) => void;
  error?: string;
}>;

export function AmountInput({ id, label, value, onChange, error }: AmountInputProps): ReactNode {
  const [draft, setDraft] = useState(() => formatMinor(value));
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(formatMinor(value));
  }, [value]);

  function commit(): void {
    try {
      onChange(parseMinor(draft));
      setParseError(null);
    } catch (caught: unknown) {
      setParseError(caught instanceof RangeError ? caught.message : "Enter a valid amount.");
    }
  }

  const message = error ?? parseError;
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        className="text-center font-mono text-[10px] font-bold tracking-wider text-foreground-muted uppercase"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          value={draft}
          type="text"
          inputMode="decimal"
          aria-invalid={message === undefined || message === null ? undefined : true}
          aria-describedby={message === undefined || message === null ? undefined : `${id}-error`}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          className="w-full rounded-xl border border-border bg-surface px-4 py-4.5 text-center font-mono text-3xl font-extrabold text-foreground tabular-nums transition-colors duration-150 placeholder:text-foreground-muted/30 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
      </div>
      {message === undefined || message === null ? null : (
        <p
          id={`${id}-error`}
          className="self-center rounded-lg border border-expense/25 bg-expense/10 px-3 py-1 font-mono text-[11px] font-semibold text-expense animate-fade-in"
        >
          {message}
        </p>
      )}
    </div>
  );
}
