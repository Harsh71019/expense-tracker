import type { ReactNode } from "react";

import { AccentPicker } from "@/components/ui/accent-picker";
import { SectionHeader } from "@/components/ui/section-header";
import { ThemePreferenceForm } from "@/components/ui/theme-toggle";
import { getStoredAccent } from "@/lib/accent-server";
import { getStoredTheme } from "@/lib/theme-server";

export async function AppearanceSection(): Promise<ReactNode> {
  const [accent, theme] = await Promise.all([getStoredAccent(), getStoredTheme()]);

  return (
    <section id="appearance" className="scroll-mt-20 space-y-4">
      <SectionHeader title="Appearance" description="Theme and accent color, applied instantly." />
      <div className="glass-card space-y-6 rounded-2xl p-4 shadow-xs sm:p-5">
        <ThemePreferenceForm current={theme} />
        <div className="border-t border-border/60 pt-6">
          <AccentPicker current={accent} />
        </div>
      </div>
    </section>
  );
}
