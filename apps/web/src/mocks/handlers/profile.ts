import type { HttpHandler } from "msw";

import type { MockHttp, MockStore } from "./types";

export function profileHandlers(http: MockHttp, store: MockStore): HttpHandler[] {
  return [
    http.get("/v1/profile", ({ response }) => {
      return response(200).json(store.profile);
    })
  ];
}
