"use client";

import type { ReactNode } from "react";

export default function GlobalError({
  reset
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>): ReactNode {
  return (
    <html lang="en-IN">
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <p>Vyaya hit an unexpected error.</p>
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium"
        >
          Reload
        </button>
      </body>
    </html>
  );
}
