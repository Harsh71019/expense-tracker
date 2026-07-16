import type { ReactNode } from "react";

import { toggleTheme } from "../../lib/theme-actions";
import type { Theme } from "../../lib/theme";

export function ThemeToggle({ current }: Readonly<{ current: Theme | null }>): ReactNode {
  const isDark = current !== "light";

  return (
    <form action={toggleTheme}>
      <button
        type="submit"
        className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-accent hover:text-foreground"
      >
        <span aria-hidden="true">{isDark ? "☀" : "●"}</span>
        <span className="hidden sm:inline">{isDark ? "Switch to light" : "Switch to dark"}</span>
      </button>
    </form>
  );
}
