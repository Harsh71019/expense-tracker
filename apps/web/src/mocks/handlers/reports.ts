import type { HttpHandler } from "msw";

import { findMonthlyRollup } from "../data/store";
import { mockProblem } from "../data/problem";
import type { MockHttp, MockStore } from "./types";

export function reportHandlers(http: MockHttp, store: MockStore): HttpHandler[] {
  return [
    http.get("/v1/reports/monthly/{month}", ({ params, response }) => {
      const rollup = findMonthlyRollup(store, params.month);
      if (rollup === undefined) {
        return response(404).json(
          mockProblem(404, "common.not_found", "Monthly rollup not found.")
        );
      }
      return response(200).json(rollup);
    })
  ];
}
