import type { ReactNode } from "react";

import { accentPreferenceKey } from "../../../lib/accent";
import type { AccentPreference } from "../../../lib/accent";
import { AccentPreferenceForm } from "./accent-preference-form";

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

      <AccentPreferenceForm key={accentPreferenceKey(current)} current={current} />
    </section>
  );
}
