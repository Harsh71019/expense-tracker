import { setupWorker } from "msw/browser";

import { createMockStore } from "./data/store";
import { createHandlers } from "./handlers";

let readyPromise: Promise<void> | null = null;

/**
 * Starts the in-browser mock worker (once) against this tab's own store
 * instance, returning a promise that resolves once it's actually
 * intercepting requests. Every caller (MockApiBoot's badge, apiClient's
 * request middleware) awaits this same promise, so no request can race
 * ahead of the service worker's async registration — see client.ts.
 */
export function ensureMockWorkerStarted(): Promise<void> {
  if (readyPromise === null) {
    readyPromise = (async () => {
      const store = createMockStore();
      const worker = setupWorker(...createHandlers("/api", store));
      await worker.start({ onUnhandledRequest: "bypass", quiet: true });
    })();
  }
  return readyPromise;
}
