import type { ReactNode } from "react";

import { applyThemePreference } from "../../../lib/theme-actions";
import { THEME_PREFERENCES, type Theme } from "../../../lib/theme";

const options = [
  { value: THEME_PREFERENCES.light, label: "Light", icon: "☀" },
  { value: THEME_PREFERENCES.dark, label: "Dark", icon: "☾" },
  { value: THEME_PREFERENCES.system, label: "System", icon: "⌘" }
] as const;

export function ThemePreferenceForm({ current }: Readonly<{ current: Theme | null }>): ReactNode {
  const selected = current ?? THEME_PREFERENCES.system;

  return (
    <form action={applyThemePreference}>
      <fieldset>
        <legend className="text-sm font-semibold text-foreground">Theme</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {options.map((option) => {
            const active = selected === option.value;
            return (
              <button
                key={option.value}
                type="submit"
                name="theme"
                value={option.value}
                aria-pressed={active}
                className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                  active
                    ? "border-accent bg-accent-glow text-accent"
                    : "border-border bg-surface-elevated text-foreground-muted hover:border-accent/40 hover:text-foreground"
                }`}
              >
                <span aria-hidden="true">{option.icon}</span>
                {option.label}
              </button>
            );
          })}
        </div>
      </fieldset>
    </form>
  );
}
