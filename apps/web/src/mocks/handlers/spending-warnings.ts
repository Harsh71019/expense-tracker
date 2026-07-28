import type { HttpHandler } from "msw";

import { findSpendingWarning } from "../data/store";
import { mockProblem } from "../data/problem";
import type { MockHttp, MockStore } from "./types";

export function spendingWarningHandlers(http: MockHttp, store: MockStore): HttpHandler[] {
  return [
    http.get("/v1/spending-warnings", ({ query, response }) => {
      const kind = query.get("kind");
      const severity = query.get("severity");
      const limitRaw = query.get("limit");
      const limit = limitRaw === null ? 20 : Number(limitRaw);
      const cursor = query.get("cursor");

      const matched = store.spendingWarnings
        .filter((warning) => warning.status === "active")
        .filter((warning) => kind === null || warning.kind === kind)
        .filter((warning) => severity === null || warning.severity === severity)
        .sort((a, b) => (b.lastDetectedAt ?? "").localeCompare(a.lastDetectedAt ?? ""));

      const startIndex =
        cursor === null
          ? 0
          : Math.max(matched.findIndex((warning) => warning.id === cursor) + 1, 0);
      const page = matched.slice(startIndex, startIndex + limit);
      const hasMore = startIndex + limit < matched.length;
      const lastItem = page.at(-1);

      return response(200).json({
        items: page,
        pageInfo: {
          nextCursor: hasMore && lastItem !== undefined ? lastItem.id : null,
          hasMore,
          limit
        },
        analysis: store.spendingWarningAnalysis
      });
    }),

    http.post("/v1/spending-warnings/{warningId}/dismiss", ({ params, request, response }) => {
      const key = request.headers.get("Idempotency-Key") ?? "";
      const replay = store.idempotency.spendingWarningDismiss.get(key);
      if (replay !== undefined) {
        return response(200).json(replay, { headers: { "Idempotency-Replayed": "true" } });
      }

      const warning = findSpendingWarning(store, params.warningId);
      if (warning === undefined) {
        return response(404).json(
          mockProblem(404, "common.not_found", "Spending warning not found.")
        );
      }

      const dismissedAt = warning.dismissedAt ?? new Date().toISOString();
      warning.status = "dismissed";
      warning.dismissedAt = dismissedAt;

      const result = { id: warning.id, status: "dismissed" as const, dismissedAt };
      store.idempotency.spendingWarningDismiss.set(key, result);
      return response(200).json(result);
    })
  ];
}
