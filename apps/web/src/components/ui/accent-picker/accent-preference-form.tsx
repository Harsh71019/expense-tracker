"use client";

import { useActionState, useState } from "react";
import type { ReactNode } from "react";

import { applyAccentPreference, resetAccentPreference } from "../../../lib/accent-actions";
import {
  ACCENT_PRESETS,
  DEFAULT_ACCENT_COLOR,
  INITIAL_ACCENT_ACTION_STATE,
  accentPreferenceKey
} from "../../../lib/accent";
import type { AccentPreference, AccentPreset } from "../../../lib/accent";
import {
  deriveCustomAccentTokens,
  parseColorInput,
  resemblesExpenseColor
} from "../../../lib/accent-color";
import { Button } from "../button";

type AccentSelection = AccentPreset | "custom";

interface PresetOption {
  id: AccentPreset;
  label: string;
  preview: string;
}

const PRESET_OPTIONS: readonly PresetOption[] = [
  { id: ACCENT_PRESETS.default, label: "Vyaya green", preview: DEFAULT_ACCENT_COLOR },
  { id: ACCENT_PRESETS.ocean, label: "Ocean blue", preview: "#1d4ed8" },
  { id: ACCENT_PRESETS.indigo, label: "Ledger indigo", preview: "#4338ca" },
  { id: ACCENT_PRESETS.violet, label: "Mumbai violet", preview: "#7e22ce" },
  { id: ACCENT_PRESETS.amber, label: "Saffron amber", preview: "#b45309" }
];

function initialSelection(current: AccentPreference): AccentSelection {
  if (current.kind === "custom") {
    return "custom";
  }
  return current.kind === "preset" ? current.preset : ACCENT_PRESETS.default;
}

function initialColor(current: AccentPreference): string {
  if (current.kind === "custom") {
    return current.color;
  }
  if (current.kind === "preset") {
    return (
      PRESET_OPTIONS.find((option) => option.id === current.preset)?.preview ?? DEFAULT_ACCENT_COLOR
    );
  }
  return DEFAULT_ACCENT_COLOR;
}

function selectedPreference(
  selection: AccentSelection,
  customColor: string
): AccentPreference | null {
  if (selection === ACCENT_PRESETS.default) {
    return { kind: "default" };
  }
  if (selection !== "custom") {
    return { kind: "preset", preset: selection };
  }

  const parsed = parseColorInput(customColor);
  if (!parsed.success) {
    return null;
  }
  return parsed.color === DEFAULT_ACCENT_COLOR
    ? { kind: "default" }
    : { kind: "custom", color: parsed.color };
}

export function AccentPreferenceForm({
  current
}: Readonly<{ current: AccentPreference }>): ReactNode {
  const [selection, setSelection] = useState<AccentSelection>(initialSelection(current));
  const [input, setInput] = useState<string>(initialColor(current));
  const [state, formAction, pending] = useActionState(
    applyAccentPreference,
    INITIAL_ACCENT_ACTION_STATE
  );
  const parsed = parseColorInput(input);
  const tokens = parsed.success ? deriveCustomAccentTokens(parsed.color) : null;
  const pickerValue = parsed.success ? parsed.color : DEFAULT_ACCENT_COLOR;
  const preference = selectedPreference(selection, input);
  const selectionKey = preference === null ? null : accentPreferenceKey(preference);
  const currentKey = accentPreferenceKey(current);
  const isApplied =
    selectionKey !== null &&
    (selectionKey === currentKey ||
      (state.status === "success" && state.appliedKey === selectionKey));
  const customIsInvalid = selection === "custom" && !parsed.success;
  const localMessage =
    selection === "custom" && parsed.success && resemblesExpenseColor(parsed.color)
      ? "This accent may resemble expense and error colors. Ledger signs and labels remain unchanged."
      : selection === "custom" &&
          parsed.success &&
          tokens !== null &&
          (tokens.light.accent !== parsed.color || tokens.dark.accent !== parsed.color)
        ? "Vyaya tuned the light and dark variants for readable contrast."
        : "";
  const actionMessage =
    state.status === "error" || (state.status === "success" && state.appliedKey === selectionKey)
      ? state.message
      : "";
  const message = customIsInvalid ? parsed.message : actionMessage || localMessage;
  const isError = customIsInvalid || state.status === "error";

  function choosePreset(option: PresetOption): void {
    setSelection(option.id);
    setInput(option.preview);
  }

  function changeCustomInput(value: string): void {
    setSelection("custom");
    setInput(value);
  }

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="accentSelection" value={selection} />

        <fieldset>
          <legend className="sr-only">Accent color presets</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {PRESET_OPTIONS.map((option) => {
              const selected = selection === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => choosePreset(option)}
                  className={`flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    selected
                      ? "border-accent bg-accent-glow text-foreground"
                      : "border-border bg-surface hover:border-accent/50"
                  }`}
                >
                  <span
                    className="h-6 w-6 shrink-0 rounded-full border border-black/15"
                    style={{ backgroundColor: option.preview }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">{option.label}</span>
                  {selected ? (
                    <span aria-hidden="true" className="text-accent">
                      ✓
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </fieldset>

        <section className="space-y-4 rounded-xl border border-border bg-surface p-4">
          <header>
            <h3 className="text-sm font-semibold text-foreground">Custom color</h3>
            <p className="mt-1 text-xs text-foreground-muted">
              Choose a preset or edit a custom value, then apply the color.
            </p>
          </header>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-foreground">
              <input
                type="color"
                aria-label="Choose a custom accent color"
                value={pickerValue}
                onChange={(event) => changeCustomInput(event.target.value)}
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
                onFocus={() => setSelection("custom")}
                onChange={(event) => changeCustomInput(event.target.value)}
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
            <div className="grid grid-cols-2 gap-3" aria-label="Accent preview">
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
        </section>

        <Button type="submit" disabled={customIsInvalid || pending || isApplied}>
          {pending ? "Applying…" : isApplied ? "Applied" : "Apply color"}
        </Button>
      </form>

      <form action={resetAccentPreference}>
        <Button type="submit" variant="secondary" disabled={current.kind === "default"}>
          Reset to Vyaya default
        </Button>
      </form>
    </div>
  );
}
