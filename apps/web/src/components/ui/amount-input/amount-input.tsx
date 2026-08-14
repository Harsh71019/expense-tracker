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

export function evaluateMathExpression(raw: string): string {
  const sanitized = raw.trim();
  if (/^[0-9.]*$/.test(sanitized)) return sanitized;
  if (!/^[0-9.\s+\-*/()]+$/.test(sanitized)) return raw;

  try {
    const matchedTokens = sanitized.match(/([0-9.]+|[+\-*/()])/g);
    if (matchedTokens === null) return raw;
    const tokens = matchedTokens;

    let index = 0;

    function parseExpression(): number {
      let val = parseTerm();
      while (index < tokens.length) {
        const op = tokens[index];
        if (op === "+" || op === "-") {
          index++;
          const nextTerm = parseTerm();
          val = op === "+" ? val + nextTerm : val - nextTerm;
        } else {
          break;
        }
      }
      return val;
    }

    function parseTerm(): number {
      let val = parseFactor();
      while (index < tokens.length) {
        const op = tokens[index];
        if (op === "*" || op === "/") {
          index++;
          const nextFactor = parseFactor();
          val = op === "*" ? val * nextFactor : val / nextFactor;
        } else {
          break;
        }
      }
      return val;
    }

    function parseFactor(): number {
      const token = tokens[index];
      if (token === undefined) throw new Error("Unexpected end of expression");
      if (token === "(") {
        index++;
        const val = parseExpression();
        if (tokens[index] === ")") index++;
        return val;
      }
      if (token === "+" || token === "-") {
        index++;
        const factor = parseFactor();
        return token === "-" ? -factor : factor;
      }
      index++;
      const num = Number(token);
      if (Number.isNaN(num)) throw new Error("Invalid number");
      return num;
    }

    const evaluated = parseExpression();
    if (
      index === tokens.length &&
      typeof evaluated === "number" &&
      !Number.isNaN(evaluated) &&
      Number.isFinite(evaluated) &&
      evaluated >= 0
    ) {
      return evaluated.toFixed(2);
    }
  } catch {
    // Fall back to original raw string if syntax is incomplete
  }
  return raw;
}

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
    const evaluatedDraft = evaluateMathExpression(draft);
    if (evaluatedDraft !== draft) {
      setDraft(evaluatedDraft);
    }
    try {
      onChange(parseMinor(evaluatedDraft));
      setParseError(null);
    } catch (caught: unknown) {
      setParseError(caught instanceof RangeError ? caught.message : "Enter a valid amount.");
    }
  }

  function addPreset(rupees: number): void {
    let currentMinor = 0;
    try {
      currentMinor = parseMinor(evaluateMathExpression(draft));
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
        className="text-center font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase"
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
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commit();
            }
          }}
          className="w-full rounded-xl border border-border bg-surface px-4 py-4.5 text-center font-mono text-3xl font-extrabold text-foreground tabular-nums transition-colors duration-150 placeholder:text-foreground-muted/30 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
      </div>

      {/* Fast Preset adjustment buttons */}
      <div className="grid grid-cols-3 gap-1.5 pt-0.5">
        {[100, 500, 1000].map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => addPreset(preset)}
            className="min-h-11 rounded-lg border border-border/60 bg-surface-muted/60 px-2 py-2 font-mono text-xs font-semibold text-foreground-muted transition-colors hover:border-accent/40 hover:bg-accent-glow hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            +₹{preset}
          </button>
        ))}
        {draft !== "0.00" && draft !== "0" && (
          <button
            type="button"
            onClick={clearAmount}
            className="col-span-3 min-h-11 rounded-lg border border-border/40 bg-surface-muted/30 px-2 py-2 font-mono text-xs font-medium text-foreground-muted/70 transition-colors hover:border-expense/40 hover:text-expense focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Clear
          </button>
        )}
      </div>

      {message === undefined || message === null ? null : (
        <p
          id={`${id}-error`}
          role="alert"
          aria-live="polite"
          className="self-center rounded-lg border border-expense/25 bg-expense/10 px-3 py-1 font-mono text-2xs font-semibold text-expense animate-fade-in motion-reduce:animate-none"
        >
          {message}
        </p>
      )}
    </div>
  );
}
