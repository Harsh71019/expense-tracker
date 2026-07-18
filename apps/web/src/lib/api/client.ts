import createClient from "openapi-fetch";

import type { paths } from "./generated/schema";

export const apiClient = createClient<paths>({ baseUrl: "/api" });

if (process.env.NEXT_PUBLIC_MOCK_API === "1") {
  // Every client-side request waits for the mock worker to finish its async
  // registration before going out — otherwise the first request from any
  // component that mounts before MockApiBoot's effect resolves (which is
  // most of them, since it's a plain sibling in the tree, not a gate in
  // front of {children}) goes out unintercepted and fails. One choke point
  // here covers every hook that uses apiClient, on every page.
  apiClient.use({
    async onRequest() {
      const { ensureMockWorkerStarted } = await import("@/mocks/browser");
      await ensureMockWorkerStarted();
    }
  });
}
