"use client";

import { useActionState, useState } from "react";
import type { ReactNode } from "react";

import { saveCustomAccent } from "../../../lib/accent-actions";
import { DEFAULT_ACCENT_COLOR, INITIAL_ACCENT_ACTION_STATE } from "../../../lib/accent";
import {
  deriveCustomAccentTokens,
  parseColorInput,
  resemblesExpenseColor
} from "../../../lib/accent-color";
import type { NormalizedHex } from "../../../lib/accent-color";
import { Button } from "../button";

export function CustomAccentInput({
  current
}: Readonly<{ current: NormalizedHex | null }>): ReactNode {
  const [input, setInput] = useState<string>(current ?? DEFAULT_ACCENT_COLOR);
  const [state, formAction, pending] = useActionState(
    saveCustomAccent,
    INITIAL_ACCENT_ACTION_STATE
  );
  const parsed = parseColorInput(input);
  const tokens = parsed.success ? deriveCustomAccentTokens(parsed.color) : null;
  const pickerValue = parsed.success ? parsed.color : DEFAULT_ACCENT_COLOR;
  const localMessage =
    parsed.success && resemblesExpenseColor(parsed.color)
      ? "This accent may resemble expense and error colors. Ledger signs and labels remain unchanged."
      : parsed.success &&
          tokens !== null &&
          (tokens.light.accent !== parsed.color || tokens.dark.accent !== parsed.color)
        ? "Vyaya tuned the light and dark variants for readable contrast."
        : "";
  const message = parsed.success ? state.message || localMessage : parsed.message;
  const isError = !parsed.success || state.status === "error";

  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-border bg-surface p-4">
      <header>
        <h3 className="text-sm font-semibold text-foreground">Custom color</h3>
        <p className="mt-1 text-xs text-foreground-muted">
          Presets above apply immediately. Use this form only for a custom value.
        </p>
      </header>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-foreground">
          <input
            type="color"
            aria-label="Choose a custom accent color"
            value={pickerValue}
            onChange={(event) => setInput(event.target.value)}
            className="h-11 w-14 cursor-pointer rounded-lg border border-border bg-surface-elevated p-1"
          />
          Color picker
        </label>

        <label htmlFor="custom-accent" className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="font-mono text-[9px] font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
            Hex, RGB, or HSL
          </span>
          <input
            id="custom-accent"
            name="accentColor"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            aria-describedby="custom-accent-help custom-accent-status"
            aria-invalid={isError}
            placeholder="#1d4ed8"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-lg border border-border bg-surface-elevated px-3.5 py-2.5 font-mono text-sm text-foreground transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </label>
      </div>

      <p id="custom-accent-help" className="text-xs text-foreground-muted">
        Examples: #1d4ed8, rgb(29, 78, 216), or hsl(224, 76%, 48%). Vyaya adjusts lightness when
        needed for readable contrast.
      </p>

      {tokens === null ? null : (
        <div className="grid grid-cols-2 gap-3" aria-label="Custom accent preview">
          <div
            className="rounded-lg border border-border p-3 text-center text-xs font-semibold"
            style={{ backgroundColor: tokens.light.accent, color: tokens.light.foreground }}
          >
            Light · {tokens.light.accent}
          </div>
          <div
            className="rounded-lg border border-border p-3 text-center text-xs font-semibold"
            style={{ backgroundColor: tokens.dark.accent, color: tokens.dark.foreground }}
          >
            Dark · {tokens.dark.accent}
          </div>
        </div>
      )}

      <p
        id="custom-accent-status"
        aria-live="polite"
        className={`min-h-5 text-xs ${isError ? "text-expense" : "text-foreground-muted"}`}
      >
        {message}
      </p>

      <Button type="submit" disabled={!parsed.success || pending}>
        {pending ? "Applying…" : "Apply custom color"}
      </Button>
    </form>
  );
}
