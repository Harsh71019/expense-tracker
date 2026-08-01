"use client";

import { useState } from "react";
import type { ReactNode } from "react";

const MASK = "••••••••••••";

export function MaskedValue({
  value,
  ariaLabel,
  className
}: Readonly<{ value: string; ariaLabel: string; className?: string }>): ReactNode {
  const [revealed, setRevealed] = useState(false);

  return (
    <span className={`inline-flex min-w-0 items-center gap-2 ${className ?? ""}`}>
      <code className="min-w-0 flex-1 truncate font-mono text-sm text-foreground">
        {revealed ? value : MASK}
      </code>
      <button
        type="button"
        onClick={() => setRevealed((current) => !current)}
        aria-label={revealed ? `Hide ${ariaLabel}` : `View ${ariaLabel}`}
        className="min-h-11 shrink-0 rounded-md px-3 py-0.5 text-xs font-medium text-foreground-muted transition-colors duration-150 hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {revealed ? "Hide" : "View"}
      </button>
    </span>
  );
}
