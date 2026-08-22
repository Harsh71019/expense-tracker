"use client";

import { useQuery } from "@tanstack/react-query";
import { formatMinor, TransactionPageSchema, type Transaction } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { apiClient } from "@/lib/api/client";
import { toAppError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  timeZone: "Asia/Kolkata"
});

// A single 25-transaction page often has too few eligible (income, posted,
// not a transfer) candidates for an infrequent lender. Follow the cursor a
// bounded number of extra pages so an older eligible deposit is still
// reachable, without turning this into a full paginated browser.
const MAX_PAGES = 5;
const MIN_ELIGIBLE_CANDIDATES = 10;

async function fetchEligibleCandidates(): Promise<Transaction[]> {
  const eligible: Transaction[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await apiClient.GET("/v1/transactions", {
      params: { query: { limit: 25, ...(cursor === undefined ? {} : { cursor }) } }
    });
    if (result.error !== undefined) throw toAppError(result.error, result.response.status);
    const parsed = TransactionPageSchema.safeParse(result.data);
    if (!parsed.success) throw toAppError(undefined, result.response.status);
    eligible.push(
      ...parsed.data.items.filter(
        (transaction) =>
          transaction.type === "income" &&
          transaction.status === "posted" &&
          transaction.transferGroupId === undefined
      )
    );
    if (!parsed.data.pageInfo.hasMore || eligible.length >= MIN_ELIGIBLE_CANDIDATES) break;
    cursor = parsed.data.pageInfo.nextCursor ?? undefined;
    if (cursor === undefined) break;
  }
  return eligible;
}

type LinkExistingRepaymentProps = Readonly<{
  outstandingMinor: number;
  selectedTransactionId: string | undefined;
  onSelect: (transactionId: string) => void;
}>;

export function LinkExistingRepayment({
  outstandingMinor,
  selectedTransactionId,
  onSelect
}: LinkExistingRepaymentProps): ReactNode {
  const query = useQuery({
    queryKey: qk.receivableLinkCandidates(),
    queryFn: fetchEligibleCandidates
  });

  const candidates = query.data ?? [];

  return (
    <div className="mt-4 space-y-4">
      <p className="text-xs leading-relaxed text-foreground-muted">
        Pick a posted deposit already in the ledger instead of posting a new one. The account is not
        touched again — only the outstanding balance changes.
      </p>

      {query.isLoading ? (
        <p className="text-sm text-foreground-muted">Loading recent deposits…</p>
      ) : candidates.length === 0 ? (
        <p className="text-sm text-foreground-muted">
          No eligible posted income transactions found.
        </p>
      ) : (
        <ul className="space-y-2">
          {candidates.map((transaction) => {
            const tooLarge = transaction.amountMinor > outstandingMinor;
            const selected = selectedTransactionId === transaction.id;
            return (
              <li key={transaction.id}>
                <button
                  type="button"
                  disabled={tooLarge}
                  aria-pressed={selected}
                  onClick={() => onSelect(transaction.id)}
                  className={`flex w-full min-h-14 items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40 ${
                    selected ? "border-accent bg-accent-glow" : "border-border bg-surface-muted"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {transaction.description}
                    </span>
                    <span className="block text-2xs text-foreground-muted">
                      {dateFormatter.format(transaction.occurredAt)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-mono text-sm font-bold text-income">
                      {formatMinor(transaction.amountMinor)}
                    </span>
                    {tooLarge ? (
                      <span className="block text-2xs text-expense">Exceeds outstanding</span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
