"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

export default function GlobalError({
  error,
  reset
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>): ReactNode {
  const [reqId, setReqId] = useState<string | null>(null);

  useEffect(() => {
    const eventId = Sentry.captureException(error, { tags: { boundary: "global" } });
    setReqId(eventId.slice(0, 6));
  }, [error]);

  return (
    <html lang="en-IN">
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <div>
          <p>Vyaya hit an unexpected error.</p>
          {reqId === null ? null : <p className="mt-1 font-mono text-xs opacity-70">ref {reqId}</p>}
        </div>
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
