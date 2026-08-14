"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  BatchCategorizeTransactionsSchema,
  formatMinor,
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
import { downloadCsvFile, generateTransactionsCsv } from "../model/export-csv";
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
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
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

  const accountById = useMemo(
    () => new Map((accounts.data ?? []).map((account) => [account.id, account])),
    [accounts.data]
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

  // Loaded Summary Stats
  const { totalInflow, totalOutflow, netFlow } = useMemo(() => {
    let inflow = 0;
    let outflow = 0;
    for (const t of transactions) {
      if (t.status === "reversed") continue;
      if (t.type === "income") {
        inflow += t.amountMinor;
      } else {
        outflow += t.amountMinor;
      }
    }
    return {
      totalInflow: inflow,
      totalOutflow: outflow,
      netFlow: inflow - outflow
    };
  }, [transactions]);

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

  function toggleSelectAllVisible(): void {
    const selectable = transactions.filter((t) => t.transferGroupId === undefined);
    if (selectedIds.size === selectable.length && selectable.length > 0) {
      clearSelection();
    } else {
      // Pick first type if mixed, or select all of first type
      const firstType = selectable[0]?.type ?? "expense";
      const matching = selectable.filter((t) => t.type === firstType).slice(0, 200);
      setSelectedIds(new Set(matching.map((t) => t.id)));
      setBatchError(undefined);
    }
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

  function handleExportCsv(): void {
    const toExport = selectedTransactions.length > 0 ? selectedTransactions : transactions;
    if (toExport.length === 0) {
      toast.error("No transactions to export");
      return;
    }
    const csvContent = generateTransactionsCsv(toExport, categoryById, accountById);
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadCsvFile(`treasury-ops-transactions-${dateStr}.csv`, csvContent);
    toast.success(`Exported ${toExport.length} transactions to CSV`);
  }

  return (
    <section className="animate-fade-in space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-2xs font-bold tracking-[0.2em] text-accent uppercase">
            Ledger · Records
          </p>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Transactions
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-foreground-muted">
            Every entry, append-only. Corrections happen by reversal, never by editing monetary
            fields.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            type="button"
            variant="secondary"
            onClick={handleExportCsv}
            className="hidden sm:inline-flex"
          >
            Export CSV
          </Button>
          <Button
            className="hidden sm:inline-flex"
            type="button"
            onClick={() => setCreateOpen(true)}
          >
            <span className="mr-1 text-base leading-none">+</span> New entry
          </Button>
        </div>
      </header>

      {/* Insights KPIs */}
      <TransactionInsightsCards initialInsights={initialInsights} />

      {/* Filter Bar */}
      <TxnFilters filters={filters} />

      {/* Table Subheader & Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-mono text-xs font-semibold text-foreground" aria-live="polite">
            {transactions.length} {transactions.length === 1 ? "entry" : "entries"} loaded
          </p>
          <div className="hidden h-3 w-px bg-border sm:block" />
          {/* Quick Net Strip */}
          <div className="hidden flex-wrap items-center gap-3 text-xs text-foreground-muted sm:flex">
            <span>
              Inflow:{" "}
              <span className="font-mono font-bold text-emerald-500">
                +{formatMinor(totalInflow)}
              </span>
            </span>
            <span>
              Outflow:{" "}
              <span className="font-mono font-bold text-rose-500">
                −{formatMinor(totalOutflow)}
              </span>
            </span>
            <span>
              Net:{" "}
              <span
                className={`font-mono font-bold ${netFlow >= 0 ? "text-emerald-500" : "text-rose-500"}`}
              >
                {netFlow >= 0 ? "+" : "−"}
                {formatMinor(Math.abs(netFlow))}
              </span>
            </span>
          </div>
        </div>

        {/* View Density Switcher */}
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-xl border border-border bg-surface-muted p-1 text-xs">
            <button
              type="button"
              onClick={() => setDensity("comfortable")}
              className={`rounded-lg px-2.5 py-1 font-semibold transition-colors ${
                density === "comfortable"
                  ? "bg-surface-elevated text-foreground shadow-xs"
                  : "text-foreground-muted hover:text-foreground"
              }`}
            >
              Comfortable
            </button>
            <button
              type="button"
              onClick={() => setDensity("compact")}
              className={`rounded-lg px-2.5 py-1 font-semibold transition-colors ${
                density === "compact"
                  ? "bg-surface-elevated text-foreground shadow-xs"
                  : "text-foreground-muted hover:text-foreground"
              }`}
            >
              Compact
            </button>
          </div>
        </div>
      </div>

      {/* Batch Operations Bar */}
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
          onExport={handleExportCsv}
        />
      )}

      {/* Transactions Ledger Table */}
      {transactions.length === 0 ? (
        <EmptyState
          title="No transactions match"
          description="Try widening the date range or clearing active filters."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/90 bg-surface-elevated shadow-xs">
          {/* Table Header */}
          <div className="hidden border-b border-border/80 bg-surface-muted/60 md:flex">
            <div className="grid w-12 shrink-0 place-items-center">
              <input
                type="checkbox"
                aria-label="Select all matching transactions"
                checked={
                  selectedIds.size > 0 &&
                  selectedIds.size ===
                    transactions.filter((t) => t.transferGroupId === undefined).length
                }
                onChange={toggleSelectAllVisible}
                className="h-4 w-4 accent-accent cursor-pointer"
              />
            </div>
            <div
              className={`${TXN_ROW_GRID} flex-1 px-5 py-3 font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase`}
            >
              <div>Description</div>
              <div>Category</div>
              <div>Account</div>
              <div>Date</div>
              <div className="text-right">Amount</div>
            </div>
          </div>

          {/* Table Rows */}
          <div className="divide-y divide-border/70">
            {transactions.map((transaction) => {
              if (transaction.transferGroupId !== undefined) {
                if (renderedTransfers.has(transaction.transferGroupId)) return null;
                renderedTransfers.add(transaction.transferGroupId);
                return (
                  <div
                    key={transaction.transferGroupId}
                    className="flex items-stretch bg-surface-muted/20"
                  >
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
                        density={density}
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
                  className={`flex items-stretch transition-colors ${
                    checked ? "bg-accent/10" : ""
                  }`}
                >
                  <label
                    className={`grid w-12 shrink-0 place-items-center focus-within:ring-2 focus-within:ring-inset focus-within:ring-accent ${
                      disabled
                        ? "cursor-not-allowed opacity-40"
                        : "cursor-pointer hover:bg-surface-muted/50"
                    }`}
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
                      className="h-4.5 w-4.5 accent-accent"
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
                      account={accountById.get(transaction.accountId)}
                      density={density}
                      onOpen={setSelected}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pagination Controls */}
      {list.hasNextPage ? (
        <div className="mt-6 flex flex-col items-center justify-center gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            {list.isFetchingNextPage ? "Loading entries…" : "Load more"}
          </Button>
          <span className="text-xs text-foreground-muted">Cursor-paginated ledger stream</span>
        </div>
      ) : null}
      {list.isError ? (
        <p className="mt-4 text-center text-sm text-expense" role="alert" aria-live="assertive">
          Could not refresh the ledger.
        </p>
      ) : null}

      {/* Modals & Drawers */}
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
  onApply,
  onExport
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
  onExport?: () => void;
}>): ReactNode {
  const pluralType = type === "expense" ? "expenses" : "income transactions";

  return (
    <section
      aria-label="Bulk category assignment"
      className="mb-3 rounded-2xl border border-accent/30 bg-accent/10 p-3.5 shadow-sm sm:p-4.5"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-accent text-accent-foreground text-xs font-bold">
              ✓
            </span>
            <p className="text-sm font-bold text-foreground">
              {selectedCount} {selectedCount === 1 ? "transaction" : "transactions"} selected
            </p>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground-muted">
            <span>Assign one category to the selected {type} batch.</span>
            {selectedCount === selectableCount ? null : (
              <button
                type="button"
                disabled={isPending}
                onClick={onSelectAll}
                className="font-bold text-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {selectionIsCapped ? "Select first" : "Select all"} {selectableCount} loaded{" "}
                {pluralType}
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex min-w-0 flex-1 flex-col gap-1 font-mono text-2xs font-extrabold tracking-[0.2em] text-foreground-muted uppercase sm:min-w-64">
            <span>{type} category</span>
            <Select
              aria-label={`Assign ${type} category`}
              options={[
                { value: "", label: "Choose a category…" },
                ...categories.map((category) => ({ value: category.id, label: category.name }))
              ]}
              value={categoryId}
              disabled={
                isPending || categoriesLoading || categoriesError || categories.length === 0
              }
              onChange={onCategoryChange}
            />
          </label>
          <div className="grid grid-cols-3 gap-2 sm:flex">
            <Button type="button" variant="ghost" disabled={isPending} onClick={onClear}>
              Clear
            </Button>
            {onExport !== undefined ? (
              <Button type="button" variant="secondary" disabled={isPending} onClick={onExport}>
                Export
              </Button>
            ) : null}
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
