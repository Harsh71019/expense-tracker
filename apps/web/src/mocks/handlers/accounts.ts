import type { HttpHandler } from "msw";

import { findAccount } from "../data/store";
import { mockProblem } from "../data/problem";
import type { MockHttp, MockStore } from "./types";

export function accountHandlers(http: MockHttp, store: MockStore): HttpHandler[] {
  return [
    http.get("/v1/accounts", ({ response }) => {
      return response(200).json(store.accounts);
    }),

    http.get("/v1/accounts/{accountId}", ({ params, response }) => {
      const account = findAccount(store, params.accountId);
      return account === undefined
        ? response(404).json(mockProblem(404, "common.not_found", "Account not found."))
        : response(200).json(account);
    }),

    http.get("/v1/accounts/{accountId}/insights", ({ params, query, response }) => {
      const account = findAccount(store, params.accountId);
      if (account === undefined) {
        return response(404).json(mockProblem(404, "common.not_found", "Account not found."));
      }

      const requestedRange = query.get("range");
      const range =
        requestedRange === "90d" || requestedRange === "1y" || requestedRange === "all"
          ? requestedRange
          : "30d";
      const now = new Date();
      const toExclusive = new Date(now);
      toExclusive.setUTCHours(24, 0, 0, 0);
      const from = new Date(toExclusive);
      if (range === "30d" || range === "90d") {
        from.setUTCDate(from.getUTCDate() - (range === "30d" ? 30 : 90));
      } else if (range === "1y") {
        from.setUTCDate(1);
        from.setUTCMonth(from.getUTCMonth() - 11);
      } else {
        const createdAt = new Date(account.createdAt ?? now.toISOString());
        from.setTime(createdAt.getTime());
        from.setUTCDate(1);
      }
      from.setUTCHours(0, 0, 0, 0);

      const periodFor = (date: Date): string => {
        const key = date.toISOString().slice(0, 10);
        return range === "30d" || range === "90d" ? key : `${key.slice(0, 7)}-01`;
      };
      const periods: string[] = [];
      for (let cursor = new Date(from); cursor < toExclusive;) {
        periods.push(periodFor(cursor));
        if (range === "30d" || range === "90d") {
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        } else {
          cursor.setUTCMonth(cursor.getUTCMonth() + 1);
        }
      }

      const accountTransactions = store.transactions.filter(
        (transaction) => transaction.accountId === account.id && transaction.occurredAt !== null
      );
      const prior = accountTransactions.filter(
        (transaction) => new Date(transaction.occurredAt ?? 0) < from
      );
      const visible = accountTransactions.filter((transaction) => {
        const occurredAt = new Date(transaction.occurredAt ?? 0);
        return occurredAt >= from && occurredAt < toExclusive;
      });
      const movement = new Map<string, { incomeMinor: number; expenseMinor: number }>();
      for (const transaction of visible) {
        const key = periodFor(new Date(transaction.occurredAt ?? 0));
        const totals = movement.get(key) ?? { incomeMinor: 0, expenseMinor: 0 };
        if (transaction.type === "income") totals.incomeMinor += transaction.amountMinor;
        else totals.expenseMinor += transaction.amountMinor;
        movement.set(key, totals);
      }
      let runningBalance =
        account.openingBalanceMinor +
        prior.reduce(
          (sum, transaction) =>
            sum +
            (transaction.type === "income" ? transaction.amountMinor : -transaction.amountMinor),
          0
        );
      const cashflowSeries = periods.map((period) => ({
        period,
        ...(movement.get(period) ?? { incomeMinor: 0, expenseMinor: 0 })
      }));
      const balanceSeries = cashflowSeries.map((point) => {
        runningBalance += point.incomeMinor - point.expenseMinor;
        return { period: point.period, balanceMinor: runningBalance };
      });
      const spending = new Map<
        string,
        {
          categoryId?: string;
          name: string;
          color?: string;
          amountMinor: number;
          transactionCount: number;
        }
      >();
      for (const transaction of visible) {
        if (
          transaction.type !== "expense" ||
          transaction.status !== "posted" ||
          transaction.transferGroupId !== undefined ||
          transaction.assetFunding !== undefined
        )
          continue;
        const category = store.categories.find((item) => item.id === transaction.categoryId);
        const key = transaction.categoryId ?? "uncategorized";
        const total = spending.get(key) ?? {
          ...(transaction.categoryId === undefined ? {} : { categoryId: transaction.categoryId }),
          name: category?.name ?? "Uncategorized",
          ...(category?.color === undefined ? {} : { color: category.color }),
          amountMinor: 0,
          transactionCount: 0
        };
        total.amountMinor += transaction.amountMinor;
        total.transactionCount += 1;
        spending.set(key, total);
      }
      const incomeMinor = visible.reduce(
        (sum, transaction) => sum + (transaction.type === "income" ? transaction.amountMinor : 0),
        0
      );
      const expenseMinor = visible.reduce(
        (sum, transaction) => sum + (transaction.type === "expense" ? transaction.amountMinor : 0),
        0
      );

      return response(200).json({
        range,
        from: from.toISOString(),
        to: new Date(toExclusive.getTime() - 1).toISOString(),
        bucket: range === "30d" || range === "90d" ? "day" : "month",
        summary: {
          incomeMinor,
          expenseMinor,
          netMinor: incomeMinor - expenseMinor,
          transactionCount: visible.length
        },
        balanceSeries,
        cashflowSeries,
        spendingByCategory: [...spending.values()].sort(
          (left, right) => right.amountMinor - left.amountMinor
        )
      });
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
        ...(body.creditCardConfig === undefined
          ? {}
          : {
              creditCardConfig: {
                ...body.creditCardConfig,
                nextStatementAt: now
              }
            }),
        isArchived: false,
        createdAt: now,
        updatedAt: now
      };
      store.accounts.push(account);
      store.idempotency.accounts.set(key, account);
      return response(201).json(account);
    }),

    http.patch(
      "/v1/accounts/{accountId}/credit-card-config",
      async ({ params, request, response }) => {
        const key = request.headers.get("Idempotency-Key") ?? "";
        const replay = store.idempotency.creditCardConfig.get(key);
        if (replay !== undefined) {
          return response(200).json(replay, {
            headers: { "Idempotency-Replayed": "true" }
          });
        }
        const account = findAccount(store, params.accountId);
        if (account === undefined) {
          return response(404).json(mockProblem(404, "common.not_found", "Account not found."));
        }
        if (account.type !== "credit_card") {
          return response(409).json(
            mockProblem(409, "bill.invalid_account_type", "Account is not a credit card.")
          );
        }
        const body = await request.json();
        if (body === undefined) {
          return response(422).json(
            mockProblem(422, "common.validation_failed", "Billing cycle is required.")
          );
        }
        const now = new Date().toISOString();
        account.creditCardConfig = {
          statementDay: body.statementDay,
          dueDay: body.dueDay,
          nextStatementAt: now
        };
        account.updatedAt = now;
        store.idempotency.creditCardConfig.set(key, account);
        return response(200).json(account);
      }
    ),

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
