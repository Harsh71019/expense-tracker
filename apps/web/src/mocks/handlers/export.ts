import { formatMinor } from "@treasury-ops/shared";
import type { HttpHandler } from "msw";

import type { MockHttp, MockStore } from "./types";

const CSV_HEADER = [
  "Date",
  "Type",
  "Status",
  "Account",
  "Category",
  "Description",
  "Tags",
  "Amount (INR)"
];

const FORMULA_PREFIXES = ["=", "+", "-", "@"];

/** Lightweight stand-in for apps/api's csv-format.ts, kept local since web can't import apps/api internals. */
function csvCell(value: string): string {
  const neutralized = FORMULA_PREFIXES.some((prefix) => value.startsWith(prefix))
    ? `'${value}`
    : value;
  const needsQuoting = /[",\n]/.test(neutralized);
  const escaped = neutralized.replaceAll('"', '""');
  return needsQuoting ? `"${escaped}"` : escaped;
}

export function exportHandlers(http: MockHttp, store: MockStore): HttpHandler[] {
  return [
    http.get("/v1/export/csv", ({ query, response }) => {
      const from = query.get("from");
      const to = query.get("to");
      const accountNames = new Map(store.accounts.map((account) => [account.id, account.name]));
      const categoryNames = new Map(
        store.categories.map((category) => [category.id, category.name])
      );

      const rows = store.transactions
        .filter((txn) => txn.status === "posted")
        .filter((txn) => from === null || (txn.occurredAt ?? "") >= from)
        .filter((txn) => to === null || (txn.occurredAt ?? "") <= to)
        .map((txn) => {
          const amount = formatMinor(Math.abs(txn.amountMinor));
          return [
            (txn.occurredAt ?? "").slice(0, 10),
            txn.type,
            txn.status,
            accountNames.get(txn.accountId) ?? "",
            txn.categoryId === undefined ? "" : (categoryNames.get(txn.categoryId) ?? ""),
            txn.description,
            txn.tags.join("; "),
            txn.type === "expense" ? `-${amount}` : amount
          ];
        });

      const csv = [CSV_HEADER, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");

      return response(200).text(csv, {
        headers: { "Content-Disposition": 'attachment; filename="treasury-ops-export.csv"' }
      });
    })
  ];
}
