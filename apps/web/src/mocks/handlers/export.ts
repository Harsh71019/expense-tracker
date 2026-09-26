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
      const accountId = query.get("accountId");
      const categoryId = query.get("categoryId");
      const uncategorized = query.get("uncategorized") === "true";
      const from = query.get("from");
      const to = query.get("to");
      const amountMinor = parseOptionalMinor(query.get("amountMinor"));
      const minAmountMinor = parseOptionalMinor(query.get("minAmountMinor"));
      const maxAmountMinor = parseOptionalMinor(query.get("maxAmountMinor"));
      const sort = query.get("sort") ?? "date_desc";
      const search = query.get("q")?.toLocaleLowerCase();
      const tag = query.get("tag");
      const accountNames = new Map(store.accounts.map((account) => [account.id, account.name]));
      const categoryNames = new Map(
        store.categories.map((category) => [category.id, category.name])
      );

      const rows = store.transactions
        .filter((txn) => txn.status === "posted")
        .filter((txn) => accountId === null || txn.accountId === accountId)
        .filter((txn) => categoryId === null || txn.categoryId === categoryId)
        .filter((txn) => !uncategorized || txn.categoryId === undefined)
        .filter((txn) => from === null || (txn.occurredAt ?? "") >= from)
        .filter((txn) => to === null || (txn.occurredAt ?? "") <= to)
        .filter((txn) => amountMinor === undefined || txn.amountMinor === amountMinor)
        .filter((txn) => minAmountMinor === undefined || txn.amountMinor >= minAmountMinor)
        .filter((txn) => maxAmountMinor === undefined || txn.amountMinor <= maxAmountMinor)
        .filter(
          (txn) => search === undefined || txn.description.toLocaleLowerCase().includes(search)
        )
        .filter((txn) => tag === null || txn.tags.includes(tag))
        .sort((left, right) => compareTransactions(left, right, sort))
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

function parseOptionalMinor(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function compareTransactions(
  left: MockStore["transactions"][number],
  right: MockStore["transactions"][number],
  sort: string
): number {
  if (sort === "amount_asc") return left.amountMinor - right.amountMinor;
  if (sort === "amount_desc") return right.amountMinor - left.amountMinor;
  const dateOrder = (left.occurredAt ?? "").localeCompare(right.occurredAt ?? "");
  return sort === "date_asc" ? dateOrder : -dateOrder;
}
