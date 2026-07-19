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
  light: string;
  dark: string;
  lightForeground: string;
  darkForeground: string;
}

interface AccentPreviewTokens {
  light: { accent: string; foreground: string };
  dark: { accent: string; foreground: string };
}

const DEFAULT_PRESET: PresetOption = {
  id: ACCENT_PRESETS.default,
  label: "Vyaya green",
  light: DEFAULT_ACCENT_COLOR,
  dark: "#34d399",
  lightForeground: "#04140d",
  darkForeground: "#04140d"
};

const PRESET_OPTIONS: readonly PresetOption[] = [
  DEFAULT_PRESET,
  {
    id: ACCENT_PRESETS.ocean,
    label: "Ocean blue",
    light: "#1d4ed8",
    dark: "#60a5fa",
    lightForeground: "#ffffff",
    darkForeground: "#071426"
  },
  {
    id: ACCENT_PRESETS.indigo,
    label: "Ledger indigo",
    light: "#4338ca",
    dark: "#818cf8",
    lightForeground: "#ffffff",
    darkForeground: "#0b1028"
  },
  {
    id: ACCENT_PRESETS.violet,
    label: "Mumbai violet",
    light: "#7e22ce",
    dark: "#c084fc",
    lightForeground: "#ffffff",
    darkForeground: "#1b0826"
  },
  {
    id: ACCENT_PRESETS.amber,
    label: "Saffron amber",
    light: "#b45309",
    dark: "#fbbf24",
    lightForeground: "#ffffff",
    darkForeground: "#211300"
  }
];

function initialSelection(current: AccentPreference): AccentSelection {
  if (current.kind === "custom") {
    return "custom";
  }
  return current.kind === "preset" ? current.preset : ACCENT_PRESETS.default;
}

function initialInput(current: AccentPreference): string {
  return current.kind === "custom" ? current.color : "";
}

function presetOption(selection: AccentPreset): PresetOption {
  return PRESET_OPTIONS.find((option) => option.id === selection) ?? DEFAULT_PRESET;
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

function previewTokens(selection: AccentSelection, input: string): AccentPreviewTokens | null {
  if (selection === "custom") {
    const parsed = parseColorInput(input);
    if (!parsed.success) {
      return null;
    }
    const tokens = deriveCustomAccentTokens(parsed.color);
    return {
      light: { accent: tokens.light.accent, foreground: tokens.light.foreground },
      dark: { accent: tokens.dark.accent, foreground: tokens.dark.foreground }
    };
  }

  const option = presetOption(selection);
  return {
    light: { accent: option.light, foreground: option.lightForeground },
    dark: { accent: option.dark, foreground: option.darkForeground }
  };
}

function ThemePreview({
  label,
  dark,
  tokens
}: Readonly<{
  label: "Light" | "Dark";
  dark: boolean;
  tokens: { accent: string; foreground: string };
}>): ReactNode {
  return (
    <div
      className={`rounded-xl border p-4 ${dark ? "border-[#1c2320] bg-black" : "border-[#e2e8e3] bg-white"}`}
    >
      <p
        className={`font-mono text-[9px] font-semibold tracking-[0.16em] uppercase ${dark ? "text-[#71817a]" : "text-[#6b7a72]"}`}
      >
        {label}
      </p>
      <span
        className="mt-3 inline-flex rounded-lg px-3 py-2 text-xs font-semibold"
        style={{ backgroundColor: tokens.accent, color: tokens.foreground }}
      >
        Primary button
      </span>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
        <span style={{ color: tokens.accent }}>A link</span>
        <span
          className="rounded-md px-2 py-1"
          style={{ backgroundColor: `${tokens.accent}1f`, color: tokens.accent }}
        >
          Active tab
        </span>
      </div>
      <div className="mt-3 flex gap-3 font-mono text-xs font-semibold">
        <span className={dark ? "text-[#34d399]" : "text-[#16a34a]"}>+₹8,500</span>
        <span className={dark ? "text-[#f87171]" : "text-[#dc2626]"}>−₹450</span>
      </div>
    </div>
  );
}

export function AccentPreferenceForm({
  current
}: Readonly<{ current: AccentPreference }>): ReactNode {
  const [selection, setSelection] = useState<AccentSelection>(initialSelection(current));
  const [input, setInput] = useState<string>(initialInput(current));
  const [state, formAction, pending] = useActionState(
    applyAccentPreference,
    INITIAL_ACCENT_ACTION_STATE
  );
  const parsed = parseColorInput(input);
  const preview = previewTokens(selection, input);
  const selectedPreset = selection === "custom" ? null : presetOption(selection);
  const pickerValue =
    selection === "custom" && parsed.success
      ? parsed.color
      : (selectedPreset?.light ?? DEFAULT_ACCENT_COLOR);
  const preference = selectedPreference(selection, input);
  const selectionKey = preference === null ? null : accentPreferenceKey(preference);
  const currentKey = accentPreferenceKey(current);
  const activeKey =
    state.status === "success" && state.appliedKey !== null ? state.appliedKey : currentKey;
  const isApplied = selectionKey !== null && selectionKey === activeKey;
  const customIsInvalid = selection === "custom" && !parsed.success;
  const localMessage =
    selection === "custom" && parsed.success && resemblesExpenseColor(parsed.color)
      ? "This accent may resemble expense and error colors. Ledger signs and labels remain unchanged."
      : selection === "custom" &&
          parsed.success &&
          preview !== null &&
          (preview.light.accent !== parsed.color || preview.dark.accent !== parsed.color)
        ? "Vyaya tuned the light and dark variants for readable contrast."
        : "";
  const actionMessage =
    state.status === "error" || (state.status === "success" && state.appliedKey === selectionKey)
      ? state.message
      : "";
  const message = customIsInvalid ? parsed.message : actionMessage || localMessage;
  const isError = customIsInvalid || state.status === "error";
  const resetDisabled = activeKey === ACCENT_PRESETS.default;

  function choosePreset(option: PresetOption): void {
    setSelection(option.id);
    setInput("");
  }

  function changeCustomInput(value: string): void {
    setSelection("custom");
    setInput(value);
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="accentSelection" value={selection} />

      <fieldset>
        <legend className="sr-only">Accent color presets</legend>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
          {PRESET_OPTIONS.map((option) => {
            const selected = selection === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={selected}
                onClick={() => choosePreset(option)}
                className={`flex min-h-24 flex-col items-center gap-2 rounded-xl border p-2.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                  selected
                    ? "border-accent bg-accent-glow text-foreground"
                    : "border-border bg-surface-elevated text-foreground-muted hover:border-accent/40 hover:text-foreground"
                }`}
              >
                <span
                  className="grid h-10 w-full place-items-center rounded-lg"
                  style={{ background: `linear-gradient(135deg, ${option.light}, ${option.dark})` }}
                  aria-hidden="true"
                >
                  {selected ? (
                    <span className="text-base font-bold" style={{ color: option.lightForeground }}>
                      ✓
                    </span>
                  ) : null}
                </span>
                <span className="text-[11px] leading-tight font-semibold">{option.label}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <section
        className={`rounded-xl border p-4 transition-colors ${selection === "custom" ? "border-accent bg-accent-glow/30" : "border-border bg-surface-elevated"}`}
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">Custom color</h3>
          {selection === "custom" ? (
            <span className="rounded-md border border-accent/30 bg-accent-glow px-2 py-0.5 font-mono text-[9px] font-semibold tracking-wider text-accent uppercase">
              Staged
            </span>
          ) : null}
        </div>

        <div className="mt-3 flex items-stretch gap-2.5">
          <label className="shrink-0">
            <span className="sr-only">Choose a custom accent color</span>
            <input
              type="color"
              aria-label="Choose a custom accent color"
              value={pickerValue}
              onChange={(event) => changeCustomInput(event.target.value)}
              className="h-12 w-14 cursor-pointer rounded-lg border border-border bg-surface-muted p-1"
            />
          </label>
          <label htmlFor="custom-accent" className="min-w-0 flex-1">
            <span className="sr-only">Hex, RGB, or HSL</span>
            <input
              id="custom-accent"
              name="accentColor"
              value={input}
              onFocus={() => setSelection("custom")}
              onChange={(event) => changeCustomInput(event.target.value)}
              aria-label="Hex, RGB, or HSL"
              aria-describedby="custom-accent-help custom-accent-status"
              aria-invalid={isError}
              placeholder="#1d4ed8"
              autoComplete="off"
              spellCheck={false}
              className="h-12 w-full rounded-lg border border-border bg-surface-muted px-3.5 font-mono text-sm text-foreground transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </label>
        </div>

        <p id="custom-accent-help" className="mt-2 text-xs leading-relaxed text-foreground-muted">
          Accepts #1d4ed8, rgb(29, 78, 216), or hsl(224, 76%, 48%). No alpha, gradients, or color
          names.
        </p>
      </section>

      <section aria-label="Accent preview">
        <p className="mb-2 font-mono text-[10px] font-semibold tracking-[0.14em] text-foreground-muted uppercase">
          Preview · works in both themes
        </p>
        {preview === null ? (
          <div className="rounded-xl border border-dashed border-border bg-surface-elevated p-5 text-sm text-foreground-muted">
            Enter a valid custom color to see its light and dark previews.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <ThemePreview label="Light" dark={false} tokens={preview.light} />
            <ThemePreview label="Dark" dark tokens={preview.dark} />
          </div>
        )}
      </section>

      <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center">
        <p
          id="custom-accent-status"
          aria-live="polite"
          className={`min-h-5 flex-1 text-xs ${isError ? "text-expense" : "text-foreground-muted"}`}
        >
          {message}
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button
            type="submit"
            formAction={resetAccentPreference}
            variant="secondary"
            disabled={resetDisabled || pending}
          >
            Reset to Vyaya default
          </Button>
          <Button type="submit" disabled={customIsInvalid || pending || isApplied}>
            {pending ? "Applying…" : isApplied ? "Applied" : "Apply color"}
          </Button>
        </div>
      </div>
    </form>
  );
}
