import type { ReactNode } from "react";

const STEP_LABELS = ["Upload", "Map columns", "Review"] as const;

export function ImportStepper({ step }: Readonly<{ step: 0 | 1 | 2 }>): ReactNode {
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Import steps">
      {STEP_LABELS.map((label, index) => {
        const done = index < step;
        const active = index === step;
        return (
          <div key={label} className="flex items-center gap-3">
            <div className="flex items-center gap-3">
              <div
                className={`grid h-7.5 w-7.5 shrink-0 place-items-center rounded-full font-mono text-[13px] font-bold ${
                  active || done
                    ? "bg-accent text-accent-foreground"
                    : "border border-border bg-surface-muted text-foreground-muted"
                }`}
                aria-current={active ? "step" : undefined}
              >
                {done ? "✓" : index + 1}
              </div>
              <span
                className={`text-sm font-semibold ${active ? "text-foreground" : "text-foreground-muted"}`}
              >
                {label}
              </span>
            </div>
            {index < STEP_LABELS.length - 1 ? (
              <div
                className={`h-0.5 w-11 rounded-full ${done ? "bg-accent" : "bg-border"}`}
                aria-hidden="true"
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
