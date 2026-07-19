import type { ReactNode } from "react";

import { resetAccentPreference, selectAccentPreset } from "../../../lib/accent-actions";
import { ACCENT_PRESETS } from "../../../lib/accent";
import type { AccentPreference, AccentPreset } from "../../../lib/accent";
import { Button } from "../button";
import { CustomAccentInput } from "./custom-accent-input";

interface PresetOption {
  id: AccentPreset;
  label: string;
  preview: string;
}

const PRESET_OPTIONS: readonly PresetOption[] = [
  { id: ACCENT_PRESETS.default, label: "Vyaya green", preview: "#0f9d63" },
  { id: ACCENT_PRESETS.ocean, label: "Ocean blue", preview: "#1d4ed8" },
  { id: ACCENT_PRESETS.indigo, label: "Ledger indigo", preview: "#4338ca" },
  { id: ACCENT_PRESETS.violet, label: "Mumbai violet", preview: "#7e22ce" },
  { id: ACCENT_PRESETS.amber, label: "Saffron amber", preview: "#b45309" }
];

function presetIsSelected(current: AccentPreference, preset: AccentPreset): boolean {
  if (preset === ACCENT_PRESETS.default) {
    return current.kind === "default";
  }
  return current.kind === "preset" && current.preset === preset;
}

export function AccentPicker({ current }: Readonly<{ current: AccentPreference }>): ReactNode {
  return (
    <section className="space-y-4 rounded-xl border border-border bg-surface-elevated p-5 sm:p-6">
      <header>
        <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-accent uppercase">
          Appearance
        </p>
        <h2 className="mt-1 text-lg font-semibold text-foreground">Accent color</h2>
        <p className="mt-1 text-sm text-foreground-muted">
          Choose a preset or create a custom accent. Money and status colors stay unchanged.
        </p>
      </header>

      <form action={selectAccentPreset}>
        <fieldset>
          <legend className="sr-only">Accent color presets</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {PRESET_OPTIONS.map((option) => {
              const selected = presetIsSelected(current, option.id);
              return (
                <button
                  key={option.id}
                  type="submit"
                  name="accent"
                  value={option.id}
                  aria-pressed={selected}
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
      </form>

      <CustomAccentInput current={current.kind === "custom" ? current.color : null} />

      <form action={resetAccentPreference}>
        <Button type="submit" variant="secondary" disabled={current.kind === "default"}>
          Reset to Vyaya default
        </Button>
      </form>
    </section>
  );
}
