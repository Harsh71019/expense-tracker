import type { ReactNode } from "react";

export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>): ReactNode {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="font-mono text-sm font-semibold tracking-[0.3em] text-foreground uppercase">
            Vyaya
          </span>
          <div className="mx-auto mt-3 h-px w-10 bg-accent" aria-hidden="true" />
        </div>
        <div className="rounded-md border border-border bg-surface-muted p-6">{children}</div>
      </div>
    </div>
  );
}
