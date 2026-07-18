import type { ReactNode } from "react";

import { toggleTheme } from "../../../lib/theme-actions";
import type { Theme } from "../../../lib/theme";

export function ThemeToggle({
  current,
  compact = false
}: Readonly<{ current: Theme | null; compact?: boolean }>): ReactNode {
  const isDark = current !== "light";

  return (
    <form action={toggleTheme} className="w-full">
      <button
        type="submit"
        aria-label={compact ? (isDark ? "Switch to light" : "Switch to dark") : undefined}
        title={compact ? (isDark ? "Switch to light" : "Switch to dark") : undefined}
        className={`flex w-full items-center gap-2 rounded-lg border border-border bg-surface-elevated px-3 py-2 text-[11px] font-bold text-foreground-muted transition-colors duration-150 hover:border-accent/40 hover:text-foreground ${compact ? "h-10 w-10 justify-center px-0" : ""}`}
      >
        <span className={compact ? "text-base" : "text-sm"} aria-hidden="true">
          {isDark ? "☼" : "☾"}
        </span>
        {compact ? (
          <span className="sr-only">{isDark ? "Switch to light" : "Switch to dark"}</span>
        ) : (
          <span className="font-mono uppercase tracking-wider hidden sm:inline">
            {isDark ? "Switch to light" : "Switch to dark"}
          </span>
        )}
      </button>
    </form>
  );
}
