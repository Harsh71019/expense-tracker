"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { isMockApiEnabled } from "./enabled";

/** Renders nothing in a real build; in mock mode, boots the browser worker and shows a small "mock API" badge. */
export function MockApiBoot(): ReactNode {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isMockApiEnabled) return;
    let cancelled = false;
    void import("./browser").then(({ ensureMockWorkerStarted }) =>
      ensureMockWorkerStarted().then(() => {
        if (!cancelled) setReady(true);
      })
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isMockApiEnabled) return null;

  return (
    <div
      className="fixed bottom-2 left-2 z-50 rounded-md border border-accent/40 bg-surface-elevated px-2 py-1 font-mono text-[10px] font-bold tracking-wider text-accent uppercase shadow-sm"
      title="Requests are served by the in-memory mock API (NEXT_PUBLIC_MOCK_API=1)"
    >
      {ready ? "Mock API" : "Starting mock API…"}
    </div>
  );
}
