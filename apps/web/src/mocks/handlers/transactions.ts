import type { HttpHandler } from "msw";

import { applyBalanceDelta, findAccount, findTransaction } from "../data/store";
import type { TransactionDto } from "../data/store";
import { mockProblem } from "../data/problem";
import type { MockHttp, MockStore } from "./types";

function matchesFilters(
  transaction: TransactionDto,
  filters: {
    accountId: string | null;
    categoryId: string | null;
    from: string | null;
    to: string | null;
    q: string | null;
  }
): boolean {
  if (filters.accountId !== null && transaction.accountId !== filters.accountId) return false;
  if (filters.categoryId !== null && transaction.categoryId !== filters.categoryId) return false;
  if (
    filters.from !== null &&
    (transaction.occurredAt === null || transaction.occurredAt < filters.from)
  )
    return false;
  if (
    filters.to !== null &&
    (transaction.occurredAt === null || transaction.occurredAt > filters.to)
  )
    return false;
  if (
    filters.q !== null &&
    !transaction.description.toLowerCase().includes(filters.q.toLowerCase())
  )
    return false;
  return true;
}

export function transactionHandlers(http: MockHttp, store: MockStore): HttpHandler[] {
  return [
    http.get("/v1/transactions", ({ query, response }) => {
      const limitRaw = query.get("limit");
      const limit = limitRaw === null ? 50 : Number(limitRaw);
      const cursor = query.get("cursor");
      const matched = store.transactions
        .filter((transaction) =>
          matchesFilters(transaction, {
            accountId: query.get("accountId"),
            categoryId: query.get("categoryId"),
            from: query.get("from"),
            to: query.get("to"),
            q: query.get("q")
          })
        )
        .sort((a, b) => (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""));

      const startIndex =
        cursor === null ? 0 : Math.max(matched.findIndex((txn) => txn.id === cursor) + 1, 0);
      const page = matched.slice(startIndex, startIndex + limit);
      const hasMore = startIndex + limit < matched.length;
      const lastItem = page.at(-1);

      return response(200).json({
        items: page,
        pageInfo: {
          nextCursor: hasMore && lastItem !== undefined ? lastItem.id : null,
          hasMore,
          limit
        }
      });
    }),

    http.post("/v1/transactions", async ({ request, response }) => {
      const key = request.headers.get("Idempotency-Key") ?? "";
      const existing = store.idempotency.transactions.get(key);
      if (existing !== undefined) {
        return response(200).json(existing, { headers: { "Idempotency-Replayed": "true" } });
      }

      const body = await request.json();
      if (body === undefined) {
        return response(422).json(
          mockProblem(422, "common.validation_failed", "Request body is required.")
        );
      }
      const account = findAccount(store, body.accountId);
      if (account === undefined) {
        return response(422).json(
          mockProblem(422, "common.validation_failed", "Account does not exist.")
        );
      }

      const now = new Date().toISOString();
      const transaction: TransactionDto = {
        id: store.nextTransactionId(),
        userId: store.profile.userId,
        accountId: body.accountId,
        ...(body.categoryId === undefined ? {} : { categoryId: body.categoryId }),
        type: body.type,
        amountMinor: body.amountMinor,
        currency: "INR",
        occurredAt: body.occurredAt,
        description: body.description,
        tags: body.tags ?? [],
        source: "manual",
        status: "posted",
        idempotencyKey: key,
        createdAt: now,
        updatedAt: now
      };
      store.transactions.push(transaction);
      applyBalanceDelta(
        store,
        account.id,
        transaction.type === "income" ? transaction.amountMinor : -transaction.amountMinor
      );
      store.idempotency.transactions.set(key, transaction);
      return response(201).json(transaction);
    }),

    http.get("/v1/transactions/{transactionId}", ({ params, response }) => {
      const transaction = findTransaction(store, params.transactionId);
      if (transaction === undefined) {
        return response(404).json(mockProblem(404, "common.not_found", "Transaction not found."));
      }
      return response(200).json(transaction);
    }),

    http.patch("/v1/transactions/{transactionId}", async ({ params, request, response }) => {
      const key = request.headers.get("Idempotency-Key") ?? "";
      const existing = store.idempotency.transactions.get(key);
      if (existing !== undefined) {
        return response(200).json(existing, { headers: { "Idempotency-Replayed": "true" } });
      }

      const transaction = findTransaction(store, params.transactionId);
      if (transaction === undefined) {
        return response(404).json(mockProblem(404, "common.not_found", "Transaction not found."));
      }
      if (transaction.transferGroupId !== undefined) {
        return response(409).json(
          mockProblem(
            409,
            "txn.transfer_metadata_requires_group",
            "Transfer legs require a group-level metadata operation."
          )
        );
      }

      const body = await request.json();
      if (body === undefined) {
        return response(422).json(
          mockProblem(422, "common.validation_failed", "Request body is required.")
        );
      }
      if (body.description !== undefined) transaction.description = body.description;
      if (body.tags !== undefined) transaction.tags = body.tags;
      if (body.categoryId !== undefined) {
        if (body.categoryId === null) {
          delete transaction.categoryId;
        } else {
          transaction.categoryId = body.categoryId;
        }
      }
      transaction.updatedAt = new Date().toISOString();
      store.idempotency.transactions.set(key, transaction);
      return response(200).json(transaction);
    }),

    http.post("/v1/transactions/{transactionId}/reverse", ({ params, response }) => {
      const original = findTransaction(store, params.transactionId);
      if (original === undefined) {
        return response(404).json(mockProblem(404, "common.not_found", "Transaction not found."));
      }
      if (original.status !== "posted") {
        return response(409).json(
          mockProblem(409, "txn.already_reversed", "Transaction is already reversed.")
        );
      }

      const now = new Date().toISOString();
      const reversal: TransactionDto = {
        ...original,
        id: store.nextTransactionId(),
        type: original.type === "expense" ? "income" : "expense",
        status: "reversal",
        reversalOf: original.id,
        description: `Reversal: ${original.description}`,
        occurredAt: now,
        createdAt: now,
        updatedAt: now
      };
      store.transactions.push(reversal);
      original.status = "reversed";
      original.reversedBy = reversal.id;
      original.updatedAt = now;
      applyBalanceDelta(
        store,
        original.accountId,
        original.type === "expense" ? original.amountMinor : -original.amountMinor
      );

      return response(200).json(reversal);
    })
  ];
}
