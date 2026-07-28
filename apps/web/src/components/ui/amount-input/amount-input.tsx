"use client";

import { formatMinor, parseMinor } from "@treasury-ops/shared";
import { useEffect, useState } from "react";
import type { ReactNode, Ref } from "react";

type AmountInputProps = Readonly<{
  id: string;
  label: string;
  value: number;
  onChange: (minor: number) => void;
  error?: string;
  inputRef?: Ref<HTMLInputElement>;
}>;

export function AmountInput({
  id,
  label,
  value,
  onChange,
  error,
  inputRef
}: AmountInputProps): ReactNode {
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

  function addPreset(rupees: number): void {
    let currentMinor = 0;
    try {
      currentMinor = parseMinor(draft);
    } catch {
      currentMinor = 0;
    }
    const nextMinor = currentMinor + rupees * 100;
    const formatted = formatMinor(nextMinor);
    setDraft(formatted);
    try {
      onChange(nextMinor);
      setParseError(null);
    } catch {
      // Invalid minor amount
    }
  }

  function clearAmount(): void {
    setDraft("0.00");
    try {
      onChange(0);
      setParseError(null);
    } catch {
      // Ignore
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
          ref={inputRef}
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

      {/* Fast Preset adjustment buttons */}
      <div className="flex items-center justify-center gap-1.5 pt-0.5">
        {[100, 500, 1000].map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => addPreset(preset)}
            className="rounded-md border border-border/60 bg-surface-muted/60 px-2 py-1 font-mono text-xs font-semibold text-foreground-muted transition-colors hover:border-accent/40 hover:bg-accent-glow hover:text-accent"
          >
            +₹{preset}
          </button>
        ))}
        {draft !== "0.00" && draft !== "0" && (
          <button
            type="button"
            onClick={clearAmount}
            className="rounded-md border border-border/40 bg-surface-muted/30 px-2 py-1 font-mono text-xs font-medium text-foreground-muted/70 hover:border-expense/40 hover:text-expense transition-colors"
          >
            Clear
          </button>
        )}
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
