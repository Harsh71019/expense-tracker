"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

export default function RouteError({
  error,
  reset
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>): ReactNode {
  const [reqId, setReqId] = useState<string | null>(null);

  useEffect(() => {
    const eventId = Sentry.captureException(error, { tags: { boundary: "route-segment" } });
    setReqId(eventId.slice(0, 6));
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <div>
        <p className="text-foreground-muted">Something went wrong loading this page.</p>
        {reqId === null ? null : (
          <p className="mt-1 font-mono text-xs text-foreground-muted">ref {reqId}</p>
        )}
      </div>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg border border-border px-4 py-2 text-sm font-medium"
      >
        Try again
      </button>
    </div>
  );
}
