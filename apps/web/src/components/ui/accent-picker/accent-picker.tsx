import type { ReactNode } from "react";

import { accentPreferenceKey } from "../../../lib/accent";
import type { AccentPreference } from "../../../lib/accent";
import { AccentPreferenceForm } from "./accent-preference-form";

export function AccentPicker({ current }: Readonly<{ current: AccentPreference }>): ReactNode {
  return (
    <section className="space-y-5 rounded-xl border border-border bg-surface-muted/50 p-4 sm:p-5">
      <header>
        <h3 className="text-sm font-semibold text-foreground">Accent color</h3>
        <p className="mt-1 text-xs leading-relaxed text-foreground-muted sm:text-sm">
          Recolors buttons, links, active navigation, focus rings, and decorative highlights. Income
          green, expense/error red, and category colors never change.
        </p>
      </header>

      <AccentPreferenceForm key={accentPreferenceKey(current)} current={current} />
    </section>
  );
}
