import type { HttpHandler } from "msw";

import { findAccount } from "../data/store";
import { mockProblem } from "../data/problem";
import type { MockHttp, MockStore } from "./types";

export function accountHandlers(http: MockHttp, store: MockStore): HttpHandler[] {
  return [
    http.get("/v1/accounts", ({ response }) => {
      return response(200).json(store.accounts);
    }),

    http.post("/v1/accounts", async ({ request, response }) => {
      const key = request.headers.get("Idempotency-Key") ?? "";
      const existing = store.idempotency.accounts.get(key);
      if (existing !== undefined) {
        return response(200).json(existing, { headers: { "Idempotency-Replayed": "true" } });
      }

      const body = await request.json();
      if (body === undefined) {
        return response(422).json(
          mockProblem(422, "common.validation_failed", "Request body is required.")
        );
      }
      const now = new Date().toISOString();
      const account = {
        id: store.nextAccountId(),
        userId: store.profile.userId,
        name: body.name,
        type: body.type,
        currency: "INR" as const,
        openingBalanceMinor: body.openingBalanceMinor,
        balanceMinor: body.openingBalanceMinor,
        isArchived: false,
        createdAt: now,
        updatedAt: now
      };
      store.accounts.push(account);
      store.idempotency.accounts.set(key, account);
      return response(201).json(account);
    }),

    http.patch("/v1/accounts/{accountId}/archive", ({ params, request, response }) => {
      const key = request.headers.get("Idempotency-Key") ?? "";
      if (store.idempotency.accountArchive.has(key)) {
        return response(204).empty({ headers: { "Idempotency-Replayed": "true" } });
      }

      const account = findAccount(store, params.accountId);
      if (account === undefined) {
        return response(404).json(mockProblem(404, "common.not_found", "Account not found."));
      }

      account.isArchived = true;
      account.updatedAt = new Date().toISOString();
      store.idempotency.accountArchive.add(key);
      return response(204).empty();
    })
  ];
}
