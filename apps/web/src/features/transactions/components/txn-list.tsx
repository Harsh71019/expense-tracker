"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  BatchCategorizeTransactionsSchema,
  type Category,
  type ListTransactionsQuery,
  type Transaction,
  type TransactionInsights,
  type TransactionPage,
  type TransactionType
} from "@treasury-ops/shared";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import { useTxnList } from "../hooks/use-txn-list";
import { useBatchCategorize } from "../hooks/use-batch-categorize";
import { CreateTxnSheet } from "./create-txn-sheet";
import { TxnDetailDrawer } from "./txn-detail-drawer";
import { TxnFilters } from "./txn-filters";
import { TXN_ROW_GRID, TxnRow } from "./txn-row";
import { TransferRow } from "./transfer-row";
import { TransactionInsightsCards } from "./transaction-insights-cards";
import { useAccounts } from "@/features/accounts";
import { useCategories } from "@/features/categories";
import { useReverseTransfer } from "@/features/transfers/hooks/use-transfers";
import { toast } from "@/lib/toast";

export function TxnList({
  filters,
  initialPage,
  initialInsights
}: Readonly<{
  filters: ListTransactionsQuery;
  initialPage: TransactionPage;
  initialInsights: TransactionInsights | null;
}>): ReactNode {
  const list = useTxnList(filters, initialPage);
  const reverseTransfer = useReverseTransfer();
  const batchCategorize = useBatchCategorize();
  const accounts = useAccounts();
  const categories = useCategories();
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Transaction>();
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [categoryId, setCategoryId] = useState("");
  const [batchError, setBatchError] = useState<string>();

  const transactions = useMemo(
    () => (list.data?.pages ?? [initialPage]).flatMap((page) => page.items),
    [initialPage, list.data?.pages]
  );
  const categoryById = useMemo(
    () => new Map((categories.data ?? []).map((category) => [category.id, category])),
    [categories.data]
  );
  const transferLegs = useMemo(() => {
    const grouped = new Map<string, Transaction[]>();
    for (const transaction of transactions) {
      if (transaction.transferGroupId !== undefined) {
        const current = grouped.get(transaction.transferGroupId) ?? [];
        grouped.set(transaction.transferGroupId, [...current, transaction]);
      }
    }
    return grouped;
  }, [transactions]);
  const selectedTransactions = transactions.filter((transaction) =>
    selectedIds.has(transaction.id)
  );
  const selectionType = selectedTransactions[0]?.type;
  const selectableOfType = transactions.filter(
    (transaction) => transaction.transferGroupId === undefined && transaction.type === selectionType
  );
  const selectableBatch = selectableOfType.slice(0, 200);
  const matchingCategories = (categories.data ?? []).filter(
    (category) => category.kind === selectionType
  );
  const renderedTransfers = new Set<string>();

  function toggleSelection(transaction: Transaction): void {
    if (!selectedIds.has(transaction.id) && selectedTransactions.length >= 200) {
      setBatchError("A batch can contain at most 200 transactions.");
      return;
    }
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(transaction.id)) {
        next.delete(transaction.id);
      } else {
        const currentType = transactions.find((item) => next.has(item.id))?.type;
        if (currentType === undefined || currentType === transaction.type) {
          next.add(transaction.id);
        }
      }
      return next;
    });
    setCategoryId("");
    setBatchError(undefined);
  }

  function clearSelection(): void {
    setSelectedIds(new Set());
    setCategoryId("");
    setBatchError(undefined);
  }

  async function applyCategory(): Promise<void> {
    const parsed = BatchCategorizeTransactionsSchema.safeParse({
      transactionIds: selectedTransactions.map((transaction) => transaction.id),
      categoryId
    });
    if (!parsed.success) {
      setBatchError(parsed.error.issues[0]?.message ?? "Choose a category for this batch.");
      return;
    }

    try {
      const result = await batchCategorize.mutateAsync(parsed.data);
      const categoryName = categoryById.get(result.categoryId)?.name ?? "Category";
      toast.success(
        `${result.updatedCount} ${result.updatedCount === 1 ? "transaction" : "transactions"} assigned to ${categoryName}`
      );
      clearSelection();
    } catch (caught: unknown) {
      const message = caught instanceof Error ? caught.message : "Could not assign the category.";
      setBatchError(message);
      toast.error(message);
    }
  }

  return (
    <section className="animate-fade-in">
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] font-bold tracking-[0.2em] text-accent uppercase">
            Ledger
          </p>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-foreground">Transactions</h1>
          <p className="mt-2 max-w-md text-sm text-foreground-muted">
            Every entry, append-only. Corrections happen by reversal, never by editing amounts.
          </p>
        </div>
        <Button className="hidden sm:inline-flex" type="button" onClick={() => setCreateOpen(true)}>
          <span className="mr-1 text-base leading-none">+</span> New entry
        </Button>
      </header>

      <TransactionInsightsCards initialInsights={initialInsights} />

      <TxnFilters filters={filters} />

      <p className="mb-3 font-mono text-xs font-medium text-foreground-muted" aria-live="polite">
        {transactions.length} {transactions.length === 1 ? "transaction" : "transactions"} · sorted
        by date
      </p>

      {selectionType === undefined ? null : (
        <BatchCategoryBar
          type={selectionType}
          selectedCount={selectedTransactions.length}
          selectableCount={selectableBatch.length}
          selectionIsCapped={selectableOfType.length > selectableBatch.length}
          categories={matchingCategories}
          categoriesLoading={categories.isLoading}
          categoriesError={categories.isError}
          categoryId={categoryId}
          error={batchError}
          isPending={batchCategorize.isPending}
          onCategoryChange={(value) => {
            setCategoryId(value);
            setBatchError(undefined);
          }}
          onSelectAll={() => {
            setSelectedIds(new Set(selectableBatch.map((transaction) => transaction.id)));
            setBatchError(undefined);
          }}
          onClear={clearSelection}
          onApply={() => void applyCategory()}
        />
      )}

      {transactions.length === 0 ? (
        <EmptyState
          title="No transactions match"
          description="Try widening the date range or clearing filters."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface-elevated">
          <div className="hidden border-b border-border md:flex">
            <div className="grid w-12 shrink-0 place-items-center font-mono text-[9px] font-bold tracking-wider text-foreground-muted uppercase">
              <span aria-hidden="true">✓</span>
              <span className="sr-only">Selection</span>
            </div>
            <div
              className={`${TXN_ROW_GRID} flex-1 px-5 py-3.5 font-mono text-[10px] font-bold tracking-wider text-foreground-muted uppercase`}
            >
              <div>Description</div>
              <div>Category</div>
              <div>Date</div>
              <div className="text-right">Amount</div>
            </div>
          </div>
          <div className="divide-y divide-border">
            {transactions.map((transaction) => {
              if (transaction.transferGroupId !== undefined) {
                if (renderedTransfers.has(transaction.transferGroupId)) return null;
                renderedTransfers.add(transaction.transferGroupId);
                return (
                  <div key={transaction.transferGroupId} className="flex items-stretch">
                    <div
                      className="grid w-12 shrink-0 place-items-center text-xs text-foreground-muted/40"
                      title="Transfers cannot be categorized in bulk"
                      aria-hidden="true"
                    >
                      ⤢
                    </div>
                    <div className="min-w-0 flex-1">
                      <TransferRow
                        legs={transferLegs.get(transaction.transferGroupId) ?? [transaction]}
                        accounts={accounts.data ?? []}
                        onOpen={setSelected}
                        onReverse={(groupId) => reverseTransfer.mutate(groupId)}
                        isReversing={reverseTransfer.isPending}
                      />
                    </div>
                  </div>
                );
              }
              const checked = selectedIds.has(transaction.id);
              const disabled = selectionType !== undefined && transaction.type !== selectionType;
              return (
                <div
                  key={transaction.id}
                  className={`flex items-stretch transition-colors ${checked ? "bg-accent/10" : ""}`}
                >
                  <label
                    className={`grid w-12 shrink-0 place-items-center focus-within:ring-2 focus-within:ring-inset focus-within:ring-accent ${disabled ? "cursor-not-allowed" : "cursor-pointer hover:bg-surface-muted/50"}`}
                    title={
                      disabled
                        ? `Clear the ${selectionType} selection before selecting an ${transaction.type} transaction.`
                        : `Select ${transaction.description}`
                    }
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled || batchCategorize.isPending}
                      onChange={() => toggleSelection(transaction)}
                      aria-label={
                        disabled
                          ? `${transaction.description} is an ${transaction.type} transaction; clear the current selection first`
                          : `Select ${transaction.description}`
                      }
                      className="h-5 w-5 accent-accent"
                    />
                  </label>
                  <div className="min-w-0 flex-1">
                    <TxnRow
                      transaction={transaction}
                      category={
                        transaction.categoryId === undefined
                          ? undefined
                          : categoryById.get(transaction.categoryId)
                      }
                      onOpen={setSelected}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {list.hasNextPage ? (
        <div className="mt-5 flex justify-center">
          <Button
            type="button"
            variant="secondary"
            disabled={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            {list.isFetchingNextPage ? "Loading entries…" : "Load more"}
          </Button>
        </div>
      ) : null}
      {list.isError ? (
        <p className="mt-4 text-center text-sm text-expense" role="alert" aria-live="assertive">
          Could not refresh the ledger.
        </p>
      ) : null}

      {createOpen ? <CreateTxnSheet onClose={() => setCreateOpen(false)} /> : null}
      {selected === undefined ? null : (
        <TxnDetailDrawer
          key={selected.id}
          transaction={selected}
          onClose={() => setSelected(undefined)}
        />
      )}
    </section>
  );
}

function BatchCategoryBar({
  type,
  selectedCount,
  selectableCount,
  selectionIsCapped,
  categories,
  categoriesLoading,
  categoriesError,
  categoryId,
  error,
  isPending,
  onCategoryChange,
  onSelectAll,
  onClear,
  onApply
}: Readonly<{
  type: TransactionType;
  selectedCount: number;
  selectableCount: number;
  selectionIsCapped: boolean;
  categories: readonly Category[];
  categoriesLoading: boolean;
  categoriesError: boolean;
  categoryId: string;
  error: string | undefined;
  isPending: boolean;
  onCategoryChange: (categoryId: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onApply: () => void;
}>): ReactNode {
  const pluralType = type === "expense" ? "expenses" : "income transactions";

  return (
    <section
      aria-label="Bulk category assignment"
      className="mb-3 rounded-xl border border-accent/30 bg-accent/10 p-3 shadow-sm sm:p-4"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {selectedCount} {selectedCount === 1 ? "transaction" : "transactions"} selected
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground-muted">
            <span>One category applies to the full {type} batch.</span>
            {selectedCount === selectableCount ? null : (
              <button
                type="button"
                disabled={isPending}
                onClick={onSelectAll}
                className="font-semibold text-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {selectionIsCapped ? "Select first" : "Select all"} {selectableCount} loaded{" "}
                {pluralType}
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex min-w-0 flex-1 flex-col gap-1 font-mono text-[9px] font-extrabold tracking-[0.2em] text-foreground-muted uppercase sm:min-w-64">
            <span>{type} category</span>
            <Select
              aria-label={`Assign ${type} category`}
              options={[
                { value: "", label: "Choose a category" },
                ...categories.map((category) => ({ value: category.id, label: category.name }))
              ]}
              value={categoryId}
              disabled={
                isPending || categoriesLoading || categoriesError || categories.length === 0
              }
              onChange={onCategoryChange}
            />
          </label>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button type="button" variant="ghost" disabled={isPending} onClick={onClear}>
              Clear
            </Button>
            <Button
              type="button"
              disabled={
                categoryId === "" || categoriesLoading || categoriesError || categories.length === 0
              }
              isLoading={isPending}
              onClick={onApply}
            >
              {isPending ? "Assigning…" : "Assign category"}
            </Button>
          </div>
        </div>
      </div>
      {categoriesLoading ? (
        <p className="mt-2 text-xs text-foreground-muted">Loading {type} categories…</p>
      ) : categoriesError ? (
        <p className="mt-2 text-xs text-expense" role="alert">
          Could not load categories. Refresh the page and try again.
        </p>
      ) : categories.length === 0 ? (
        <p className="mt-2 text-xs text-foreground-muted">
          Create an active {type} category before assigning this batch.
        </p>
      ) : null}
      {error === undefined ? null : (
        <p className="mt-2 text-sm font-medium text-expense" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
