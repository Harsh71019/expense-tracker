import { setupServer } from "msw/node";

import { getApiBaseUrl } from "@/lib/api/base-url";

import { createMockStore } from "./data/store";
import { createHandlers } from "./handlers";

let started = false;

/**
 * Starts the Node-side mock server against this process's own store
 * instance, so SSR/RSC fetches (which hit INTERNAL_API_URL directly, not
 * through the browser) are served without a real backend. See mocks/browser.ts
 * for the separate browser-side instance and why the two stores diverge.
 */
export function startMockServer(): void {
  if (started) return;
  started = true;
  const store = createMockStore();
  const server = setupServer(...createHandlers(getApiBaseUrl(), store));
  server.listen({ onUnhandledRequest: "bypass" });
}
