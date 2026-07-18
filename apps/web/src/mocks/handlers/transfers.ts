import type { HttpHandler } from "msw";

import { applyBalanceDelta, findAccount, findTransaction } from "../data/store";
import type { TransactionDto } from "../data/store";
import { mockProblem } from "../data/problem";
import type { MockHttp, MockStore } from "./types";

export function transferHandlers(http: MockHttp, store: MockStore): HttpHandler[] {
  return [
    http.post("/v1/transfers", async ({ request, response }) => {
      const key = request.headers.get("Idempotency-Key") ?? "";
      const existing = store.idempotency.transfers.get(key);
      if (existing !== undefined) {
        return response(200).json(existing, { headers: { "Idempotency-Replayed": "true" } });
      }

      const body = await request.json();
      if (body === undefined) {
        return response(422).json(
          mockProblem(422, "common.validation_failed", "Request body is required.")
        );
      }
      const from = findAccount(store, body.fromAccountId);
      const to = findAccount(store, body.toAccountId);
      if (from === undefined || to === undefined) {
        return response(422).json(
          mockProblem(422, "common.validation_failed", "Both accounts must exist.")
        );
      }

      const transferGroupId = store.nextTransferGroupId();
      const now = new Date().toISOString();
      const fromTransaction: TransactionDto = {
        id: store.nextTransactionId(),
        userId: store.profile.userId,
        accountId: from.id,
        type: "expense",
        amountMinor: body.amountMinor,
        currency: "INR",
        occurredAt: body.occurredAt,
        description: body.description,
        tags: body.tags ?? [],
        source: "manual",
        status: "posted",
        transferGroupId,
        createdAt: now,
        updatedAt: now
      };
      const toTransaction: TransactionDto = {
        id: store.nextTransactionId(),
        userId: store.profile.userId,
        accountId: to.id,
        type: "income",
        amountMinor: body.amountMinor,
        currency: "INR",
        occurredAt: body.occurredAt,
        description: body.description,
        tags: body.tags ?? [],
        source: "manual",
        status: "posted",
        transferGroupId,
        createdAt: now,
        updatedAt: now
      };
      store.transactions.push(fromTransaction, toTransaction);
      applyBalanceDelta(store, from.id, -fromTransaction.amountMinor);
      applyBalanceDelta(store, to.id, toTransaction.amountMinor);

      const transfer = { transferGroupId, fromTransaction, toTransaction };
      store.idempotency.transfers.set(key, transfer);
      return response(201).json(transfer);
    }),

    http.post("/v1/transfers/{transferGroupId}/reverse", ({ params, response }) => {
      const legs = store.transactions.filter(
        (transaction) => transaction.transferGroupId === params.transferGroupId
      );
      const fromLeg = legs.find((leg) => leg.type === "expense" && leg.status !== "reversal");
      const toLeg = legs.find((leg) => leg.type === "income" && leg.status !== "reversal");
      if (fromLeg === undefined || toLeg === undefined) {
        return response(404).json(mockProblem(404, "common.not_found", "Transfer not found."));
      }

      if (fromLeg.status === "reversed" && fromLeg.reversedBy !== undefined) {
        const fromReversal = findTransaction(store, fromLeg.reversedBy);
        const toReversal =
          toLeg.reversedBy === undefined ? undefined : findTransaction(store, toLeg.reversedBy);
        if (fromReversal !== undefined && toReversal !== undefined) {
          return response(200).json(
            { transferGroupId: params.transferGroupId, legs: [fromReversal, toReversal] },
            { headers: { "Idempotency-Replayed": "true" } }
          );
        }
      }

      const now = new Date().toISOString();
      const reverseLeg = (leg: TransactionDto): TransactionDto => {
        const reversal: TransactionDto = {
          ...leg,
          id: store.nextTransactionId(),
          type: leg.type === "expense" ? "income" : "expense",
          status: "reversal",
          reversalOf: leg.id,
          description: `Reversal: ${leg.description}`,
          occurredAt: now,
          createdAt: now,
          updatedAt: now
        };
        store.transactions.push(reversal);
        leg.status = "reversed";
        leg.reversedBy = reversal.id;
        leg.updatedAt = now;
        applyBalanceDelta(
          store,
          leg.accountId,
          leg.type === "expense" ? leg.amountMinor : -leg.amountMinor
        );
        return reversal;
      };

      const fromReversal = reverseLeg(fromLeg);
      const toReversal = reverseLeg(toLeg);

      return response(200).json({
        transferGroupId: params.transferGroupId,
        legs: [fromReversal, toReversal]
      });
    })
  ];
}
