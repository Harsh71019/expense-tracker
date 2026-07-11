"use client";

import type { ReactNode } from "react";

export default function RouteError({
  reset
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>): ReactNode {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-foreground-muted">Something went wrong loading this page.</p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md border border-border px-4 py-2 text-sm font-medium"
      >
        Try again
      </button>
    </div>
  );
}
