import { setupWorker } from "msw/browser";

import { createMockStore } from "./data/store";
import { createHandlers } from "./handlers";

let started = false;

/**
 * Starts the in-browser mock worker against this tab's own store instance.
 * Only reachable when NEXT_PUBLIC_MOCK_API=1 (see MockApiBoot.tsx) — never
 * imported into a production bundle path that runs unconditionally.
 */
export async function startMockWorker(): Promise<void> {
  if (started) return;
  started = true;
  const store = createMockStore();
  const worker = setupWorker(...createHandlers("/api", store));
  await worker.start({ onUnhandledRequest: "bypass", quiet: true });
}
