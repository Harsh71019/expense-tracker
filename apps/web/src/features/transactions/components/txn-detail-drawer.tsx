"use client";

import { UpdateTransactionSchema, type Category, type Transaction } from "@treasury-ops/shared";
import Link from "next/link";
import { useState } from "react";
import type { ReactNode } from "react";

import { DialogSurface } from "@/components/ui/dialog";
import { Money } from "@/components/ui/money";
import { useAccounts } from "@/features/accounts";
import { isLinkableBillPaymentSource, LinkBillPaymentDialog } from "@/features/bills";
import { IconGlyph, CategoryPicker, useCategories } from "@/features/categories";
import { toast } from "@/lib/toast";

import { useReverseTxn } from "../hooks/use-reverse-txn";
import { useTxn, useUpdateTxn } from "../hooks/use-txn";
import { ReverseConfirmDialog } from "./reverse-confirm-dialog";
import { paymentRailLabel } from "./payment-rail-badge";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata"
});

function categoryIcon(category: Category | undefined, isIncome: boolean): string {
  if (category?.icon !== undefined) return category.icon;
  return isIncome ? "↓" : "↑";
}

function sourceLabel(source: string): string {
  switch (source) {
    case "csv_import":
      return "CSV Statement Import";
    case "recurring":
      return "Recurring Automation Engine";
    case "api":
      return "API Ingestion";
    case "manual":
      return "Manual Entry";
    default:
      return source.replace("_", " ");
  }
}

type TxnDetailDrawerProps = Readonly<{ transaction: Transaction; onClose: () => void }>;

export function TxnDetailDrawer({
  transaction: initialTransaction,
  onClose
}: TxnDetailDrawerProps): ReactNode {
  const query = useTxn(initialTransaction.id, initialTransaction);
  const transaction = query.data ?? initialTransaction;
  const accounts = useAccounts();
  const categories = useCategories();
  const update = useUpdateTxn();
  const reverse = useReverseTxn();
  const [reverseOpen, setReverseOpen] = useState(false);
  const [linkingBillPayment, setLinkingBillPayment] = useState(false);
  const [description, setDescription] = useState(transaction.description);
  const [categoryId, setCategoryId] = useState<string | undefined>(transaction.categoryId);
  const [tags, setTags] = useState<string[]>(transaction.tags);
  const [tagDraft, setTagDraft] = useState("");
  const [error, setError] = useState<string>();

  const isIncome = transaction.type === "income";
  const isTransfer = transaction.transferGroupId !== undefined;
  const isReversed = transaction.status === "reversed";
  const isReversal = transaction.status === "reversal";
  const canReverse = transaction.status === "posted" && !isTransfer;
  const editable = !isReversed && !isReversal && !isTransfer;

  const account = accounts.data?.find((item) => item.id === transaction.accountId);
  const category = categories.data?.find((item) => item.id === transaction.categoryId);
  const railLabel = paymentRailLabel(transaction.paymentRail);
  const canLinkBillPayment = isLinkableBillPaymentSource(transaction, accounts.data ?? []);

  async function saveChanges(): Promise<void> {
    const patch = {
      ...(description === transaction.description ? {} : { description }),
      ...(tags.join(",") === transaction.tags.join(",") ? {} : { tags }),
      ...(categoryId === transaction.categoryId ? {} : { categoryId: categoryId ?? null })
    };
    const parsed = UpdateTransactionSchema.safeParse(patch);
    if (!parsed.success) {
      onClose();
      return;
    }
    try {
      await update.mutateAsync({ transactionId: transaction.id, patch: parsed.data });
      toast.success("Transaction details updated");
      onClose();
    } catch (caught: unknown) {
      const message = caught instanceof Error ? caught.message : "Could not save these changes.";
      setError(message);
      toast.error(message);
    }
  }

  function addTagFromDraft(): void {
    const value = tagDraft.trim();
    if (value === "" || tags.includes(value)) return;
    setTags([...tags, value]);
    setTagDraft("");
  }

  if (linkingBillPayment) {
    return (
      <LinkBillPaymentDialog
        transaction={transaction}
        accounts={accounts.data ?? []}
        onClose={() => setLinkingBillPayment(false)}
      />
    );
  }

  return (
    <>
      <DialogSurface labelledBy="txn-detail-title" onClose={onClose} variant="drawer">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-surface-muted text-xl">
              <IconGlyph value={categoryIcon(category, isIncome)} size={22} />
            </span>
            <div>
              <p
                id="txn-detail-title"
                className="font-mono text-xs font-semibold tracking-wider text-foreground-muted uppercase"
              >
                {isIncome ? "Income" : "Expense"}
              </p>
              <div className="mt-0.5">
                <Money
                  minor={transaction.amountMinor}
                  variant={transaction.type}
                  signed
                  size="lg"
                />
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border bg-surface-muted text-foreground-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            ✕
          </button>
        </div>

        {isReversed || isReversal ? (
          <p className="mt-5 rounded-xl border border-warning/25 bg-warning/10 px-4 py-3.5 text-sm leading-relaxed text-warning">
            {isReversed
              ? "This transaction was reversed. It stays on record but no longer affects balances."
              : "This is a reversal entry compensating an earlier transaction. It cannot itself be reversed."}
          </p>
        ) : null}

        <dl className="mt-6 grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-3 border-y border-border py-4.5">
          <dt className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
            Account
          </dt>
          <dd className="text-right text-sm font-semibold text-foreground">
            {account?.name ?? "Archived account"}
          </dd>
          <dt className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
            Date
          </dt>
          <dd className="text-right text-sm font-semibold text-foreground">
            {dateFormatter.format(transaction.occurredAt)}
          </dd>
          <dt className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
            Source
          </dt>
          <dd className="text-right text-sm font-semibold text-foreground capitalize">
            {sourceLabel(transaction.source)}
          </dd>
          <dt className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
            Status
          </dt>
          <dd className="text-right text-sm font-semibold text-foreground capitalize">
            {transaction.status}
          </dd>
          {railLabel === null ? null : (
            <>
              <dt className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
                Payment rail
              </dt>
              <dd className="text-right text-sm font-semibold text-foreground">{railLabel}</dd>
            </>
          )}
          {transaction.counterpartyHandle === null ? null : (
            <>
              <dt className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
                UPI handle
              </dt>
              <dd className="break-all text-right text-sm font-semibold text-foreground">
                {transaction.counterpartyHandle}
              </dd>
            </>
          )}
        </dl>

        {/* Linked Entities Forensics */}
        {transaction.recurringRuleId ||
        transaction.billId ||
        transaction.transferGroupId ||
        transaction.reversalOf ||
        transaction.reversedBy ? (
          <div className="mt-4 space-y-2 rounded-xl border border-border/80 bg-surface-muted/50 p-3 text-xs">
            <p className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
              Linked Ledger Entities
            </p>
            {transaction.recurringRuleId ? (
              <Link
                href="/recurring"
                className="flex items-center justify-between gap-2 rounded-lg border border-accent/20 bg-accent/5 p-2 font-medium text-foreground hover:bg-accent/10"
              >
                <span>⚡ Active Recurring Automation Rule</span>
                <span className="font-mono text-2xs text-accent">View Rule →</span>
              </Link>
            ) : null}
            {transaction.billId ? (
              <Link
                href="/bills"
                className="flex items-center justify-between gap-2 rounded-lg border border-income/20 bg-income/5 p-2 font-medium text-foreground hover:bg-income/10"
              >
                <span>💳 Credit Card Statement Match</span>
                <span className="font-mono text-2xs text-income">View Statement →</span>
              </Link>
            ) : null}
            {transaction.transferGroupId ? (
              <Link
                href="/transfers"
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface p-2 font-medium text-foreground hover:bg-surface-muted"
              >
                <span>⤢ Paired Transfer Group</span>
                <span className="font-mono text-2xs text-accent">View Pair →</span>
              </Link>
            ) : null}
            {transaction.reversalOf ? (
              <Link
                href={`/transactions/${transaction.reversalOf}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-warning/20 bg-warning/5 p-2 font-medium text-foreground hover:bg-warning/10"
              >
                <span>↺ Compensating Reversal of Earlier Entry</span>
                <span className="font-mono text-2xs text-warning">View Original →</span>
              </Link>
            ) : null}
            {transaction.reversedBy ? (
              <Link
                href={`/transactions/${transaction.reversedBy}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-warning/20 bg-warning/5 p-2 font-medium text-foreground hover:bg-warning/10"
              >
                <span>↺ Compensated by Reversal Entry</span>
                <span className="font-mono text-2xs text-warning">View Reversal →</span>
              </Link>
            ) : null}
          </div>
        ) : null}

        <Link
          href={`/transactions/${transaction.id}`}
          className="mt-3 inline-block text-xs font-semibold text-accent hover:text-accent-strong"
        >
          More details →
        </Link>

        {canLinkBillPayment ? (
          <button
            type="button"
            onClick={() => setLinkingBillPayment(true)}
            className="mt-5 flex min-h-14 w-full items-center gap-3 rounded-xl border border-income/25 bg-income/5 px-4 py-3 text-left transition-colors hover:bg-income/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-income"
          >
            <span
              aria-hidden="true"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-income/15 text-lg"
            >
              ↗
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">
                Mark as credit card payment
              </span>
              <span className="mt-0.5 block text-xs text-foreground-muted">
                Apply this debit to a card and reduce its outstanding balance.
              </span>
            </span>
            <span aria-hidden="true" className="text-income">
              →
            </span>
          </button>
        ) : null}

        {isTransfer ? (
          <div className="mt-5 rounded-xl border border-border bg-accent/5 p-4">
            <p className="text-sm leading-relaxed text-foreground-muted">
              <strong className="text-foreground">⤢ This is a transfer leg.</strong> It can&apos;t
              be edited or reversed on its own — manage it from the transaction&apos;s full page so
              both legs stay in sync.
            </p>
          </div>
        ) : editable ? (
          <div className="mt-5 space-y-4">
            <label className="flex flex-col gap-1.5 font-mono text-2xs font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
              Description
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={500}
                className="min-h-11 w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-base font-medium text-foreground normal-case tracking-normal outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 sm:text-sm"
              />
            </label>

            <div>
              <p className="font-mono text-2xs font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
                Category
              </p>
              <div className="mt-2">
                <CategoryPicker
                  categories={categories.data ?? []}
                  type={transaction.type}
                  value={categoryId}
                  onChange={setCategoryId}
                  description={description}
                  occurredAt={transaction.occurredAt}
                  allowUncategorized
                  label="Category"
                />
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-foreground-muted">
                Uncategorize is an explicit action — it clears the category rather than leaving it
                as-is.
              </p>
            </div>

            <div>
              <p className="font-mono text-2xs font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
                Tags
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-surface-muted px-2.5 py-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-md bg-accent/10 py-1 pr-1 pl-2.5 text-xs font-medium text-accent"
                  >
                    #{tag}
                    <button
                      type="button"
                      onClick={() => setTags(tags.filter((candidate) => candidate !== tag))}
                      aria-label={`Remove tag ${tag}`}
                      className="px-1 text-sm leading-none"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  value={tagDraft}
                  onChange={(event) => setTagDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addTagFromDraft();
                    }
                  }}
                  placeholder="Add tag…"
                  className="min-h-11 min-w-20 flex-1 bg-transparent px-1 py-1 text-base text-foreground outline-none sm:text-sm"
                />
              </div>
            </div>

            <p className="text-xs leading-relaxed text-foreground-muted">
              Only description, tags, and category are editable — amount, type, account, and date
              are permanent.
            </p>
          </div>
        ) : null}

        {error === undefined ? null : (
          <p role="alert" className="mt-4 text-sm text-expense">
            {error}
          </p>
        )}

        <div className="safe-area-bottom sticky bottom-0 -mx-5 mt-6 flex flex-wrap items-center gap-2.5 border-t border-border bg-surface-elevated/95 px-5 pt-5 backdrop-blur sm:-mx-7 sm:px-7">
          {canReverse ? (
            <button
              type="button"
              onClick={() => setReverseOpen(true)}
              className="min-h-11 flex-1 rounded-lg border border-warning/30 bg-warning/10 px-4 py-2.5 text-sm font-semibold text-warning hover:bg-warning/15 sm:flex-none"
            >
              ↺ Reverse &amp; repost
            </button>
          ) : null}
          <div className="flex-1" />
          {editable ? (
            <button
              type="button"
              onClick={() => void saveChanges()}
              disabled={update.isPending}
              className="min-h-11 flex-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-colors duration-150 hover:bg-accent-strong disabled:pointer-events-none disabled:opacity-50 sm:flex-none"
            >
              {update.isPending ? "Saving…" : "Save changes"}
            </button>
          ) : null}
        </div>
      </DialogSurface>

      {reverseOpen ? (
        <ReverseConfirmDialog
          title="Reverse this transaction?"
          body={
            <>
              This posts a compensating entry of the opposite sign. The original is marked{" "}
              <strong className="text-foreground">reversed</strong> and the new one{" "}
              <strong className="text-foreground">reversal</strong> — nothing is deleted, and the
              amount can&apos;t be undone twice.
            </>
          }
          isPending={reverse.isPending}
          onCancel={() => setReverseOpen(false)}
          onConfirm={() => {
            reverse.mutate(transaction.id);
            setReverseOpen(false);
            onClose();
          }}
        />
      ) : null}
    </>
  );
}
