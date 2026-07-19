import type { HttpHandler } from "msw";
import { createOpenApiHttp } from "openapi-msw";

import type { paths } from "@/lib/api/generated/schema";

import type { MockStore } from "../data/store";
import { accountHandlers } from "./accounts";
import { assetHandlers } from "./assets";
import { categoryHandlers } from "./categories";
import { categoryRuleHandlers } from "./category-rules";
import { exportHandlers } from "./export";
import { importHandlers } from "./imports";
import { netWorthHandlers } from "./net-worth";
import { profileHandlers } from "./profile";
import { reportHandlers } from "./reports";
import { transactionHandlers } from "./transactions";
import { transferHandlers } from "./transfers";

/**
 * Builds the full set of mock handlers for one origin. Called once per
 * runtime (browser tab, Node/SSR process) with that runtime's own store
 * instance — see mocks/browser.ts and mocks/server.ts for why they don't
 * share state.
 */
export function createHandlers(baseUrl: string, store: MockStore): HttpHandler[] {
  const http = createOpenApiHttp<paths>({ baseUrl });

  return [
    ...accountHandlers(http, store),
    ...categoryHandlers(http, store),
    ...categoryRuleHandlers(http, store),
    ...transactionHandlers(http, store),
    ...transferHandlers(http, store),
    ...assetHandlers(http, store),
    ...netWorthHandlers(http, store),
    ...importHandlers(http, store),
    ...exportHandlers(http, store),
    ...profileHandlers(http, store),
    ...reportHandlers(http, store)
  ];
}
