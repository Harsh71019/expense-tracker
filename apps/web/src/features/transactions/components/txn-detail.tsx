"use client";

import { UpdateTransactionSchema, type Transaction } from "@treasury-ops/shared";
import Link from "next/link";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { useAccounts } from "@/features/accounts";
import { isLinkableBillPaymentSource, LinkBillPaymentDialog } from "@/features/bills";
import { CategoryPicker, useCategories } from "@/features/categories";
import {
  isLinkableRecurringOccurrenceSource,
  LinkRecurringOccurrenceDialog
} from "@/features/recurring/components/link-recurring-occurrence-dialog";
import { useReverseTransfer } from "@/features/transfers/hooks/use-transfers";
import { toast } from "@/lib/toast";

import { useReverseTxn } from "../hooks/use-reverse-txn";
import { useTxn, useUpdateTxn } from "../hooks/use-txn";
import { PaymentRailBadge, paymentRailLabel } from "./payment-rail-badge";

const dateTime = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata"
});

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

export function TxnDetail({ initialTransaction }: { initialTransaction: Transaction }): ReactNode {
  const query = useTxn(initialTransaction.id, initialTransaction);
  const transaction = query.data ?? initialTransaction;
  const accounts = useAccounts();
  const categories = useCategories();
  const update = useUpdateTxn();
  const reverse = useReverseTxn();
  const reverseTransfer = useReverseTransfer();
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(transaction.description);
  const [categoryId, setCategoryId] = useState(transaction.categoryId ?? "");
  const [tags, setTags] = useState(transaction.tags.join(", "));
  const [error, setError] = useState<string>();
  const [linkingRecurring, setLinkingRecurring] = useState(false);
  const [linkingBillPayment, setLinkingBillPayment] = useState(false);
  const accountName =
    accounts.data?.find((item) => item.id === transaction.accountId)?.name ?? "Archived account";
  const categoryName =
    transaction.categoryId === undefined
      ? "No category"
      : (categories.data?.find((item) => item.id === transaction.categoryId)?.name ??
        "Archived or unavailable category");
  const isTransfer = transaction.transferGroupId !== undefined;

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const patch = {
      ...(description === transaction.description ? {} : { description }),
      ...(tags === transaction.tags.join(", ")
        ? {}
        : {
            tags: tags
              .split(",")
              .map((tag) => tag.trim())
              .filter((tag) => tag !== "")
          }),
      ...(categoryId === (transaction.categoryId ?? "")
        ? {}
        : { categoryId: categoryId === "" ? null : categoryId })
    };
    const parsed = UpdateTransactionSchema.safeParse(patch);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Change at least one metadata field.");
      return;
    }
    try {
      await update.mutateAsync({ transactionId: transaction.id, patch: parsed.data });
      setEditing(false);
      setError(undefined);
      toast.success("Transaction details updated");
    } catch (caught: unknown) {
      const message = caught instanceof Error ? caught.message : "Could not update metadata.";
      setError(message);
      toast.error(message);
    }
  }

  return (
    <section className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{transaction.description}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant={transaction.status === "posted" ? "success" : "reversed"}>
              {transaction.status}
            </Badge>
            <Badge variant="pending">{sourceLabel(transaction.source)}</Badge>
            {isTransfer ? <Badge variant="success">transfer</Badge> : null}
            <PaymentRailBadge rail={transaction.paymentRail} />
          </div>
        </div>
        <Money minor={transaction.amountMinor} variant={transaction.type} signed size="lg" />
      </header>

      {/* Forensic Ledger Facts */}
      <section className="rounded-xl border border-border bg-surface-elevated p-5">
        <h2 className="font-bold">Ledger facts</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <Fact label="Account" value={accountName} />
          <Fact label="Category" value={categoryName} />
          <Fact label="Type" value={transaction.type} />
          <Fact
            label="Payment rail"
            value={paymentRailLabel(transaction.paymentRail) ?? "Unknown"}
          />
          {transaction.counterpartyHandle === null ? null : (
            <Fact label="UPI handle" value={transaction.counterpartyHandle} />
          )}
          <Fact label="Occurred" value={dateTime.format(transaction.occurredAt)} />
          <Fact label="Created" value={dateTime.format(transaction.createdAt)} />
          <Fact label="Updated" value={dateTime.format(transaction.updatedAt)} />
          <Fact
            label="Tags"
            value={transaction.tags.length === 0 ? "None" : transaction.tags.join(", ")}
          />
          <Fact
            label="Linkage"
            value={
              transaction.reversalOf === undefined
                ? transaction.reversedBy === undefined
                  ? isTransfer
                    ? `Transfer group ${transaction.transferGroupId}`
                    : "Original entry"
                  : `Reversed by ${transaction.reversedBy}`
                : `Reversal of ${transaction.reversalOf}`
            }
          />
        </dl>
      </section>

      {/* Linked Ledger Entities */}
      {transaction.recurringRuleId ||
      transaction.billId ||
      transaction.transferGroupId ||
      transaction.reversalOf ||
      transaction.reversedBy ? (
        <section className="rounded-xl border border-border/80 bg-surface-muted/50 p-5">
          <h2 className="font-bold">Linked ledger subsystems</h2>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {transaction.recurringRuleId ? (
              <Link
                href="/recurring"
                className="flex items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent/5 p-3.5 font-medium text-foreground hover:bg-accent/10"
              >
                <div>
                  <span className="block text-sm font-semibold">⚡ Recurring Automation Rule</span>
                  <span className="font-mono text-xs text-foreground-muted">
                    Rule ID: {transaction.recurringRuleId.slice(0, 8)}…
                  </span>
                </div>
                <span className="font-mono text-xs font-bold text-accent">View Rule →</span>
              </Link>
            ) : null}
            {transaction.billId ? (
              <Link
                href="/bills"
                className="flex items-center justify-between gap-3 rounded-xl border border-income/30 bg-income/5 p-3.5 font-medium text-foreground hover:bg-income/10"
              >
                <div>
                  <span className="block text-sm font-semibold">💳 Credit Card Statement</span>
                  <span className="font-mono text-xs text-foreground-muted">
                    Bill ID: {transaction.billId.slice(0, 8)}…
                  </span>
                </div>
                <span className="font-mono text-xs font-bold text-income">View Statement →</span>
              </Link>
            ) : null}
            {transaction.transferGroupId ? (
              <Link
                href="/transfers"
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3.5 font-medium text-foreground hover:bg-surface-muted"
              >
                <div>
                  <span className="block text-sm font-semibold">⤢ Paired Transfer Group</span>
                  <span className="font-mono text-xs text-foreground-muted">
                    Group: {transaction.transferGroupId.slice(0, 8)}…
                  </span>
                </div>
                <span className="font-mono text-xs font-bold text-accent">View Pair →</span>
              </Link>
            ) : null}
            {transaction.reversalOf ? (
              <Link
                href={`/transactions/${transaction.reversalOf}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning/5 p-3.5 font-medium text-foreground hover:bg-warning/10"
              >
                <div>
                  <span className="block text-sm font-semibold">↺ Compensating Reversal</span>
                  <span className="font-mono text-xs text-warning">Reversal of original</span>
                </div>
                <span className="font-mono text-xs font-bold text-warning">View Original →</span>
              </Link>
            ) : null}
            {transaction.reversedBy ? (
              <Link
                href={`/transactions/${transaction.reversedBy}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning/5 p-3.5 font-medium text-foreground hover:bg-warning/10"
              >
                <div>
                  <span className="block text-sm font-semibold">↺ Compensated Entry</span>
                  <span className="font-mono text-xs text-warning">Reversed by entry</span>
                </div>
                <span className="font-mono text-xs font-bold text-warning">View Reversal →</span>
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      {isTransfer ? (
        <section className="rounded-xl border border-accent/30 bg-accent/5 p-5">
          <h2 className="font-bold">Linked transfer leg</h2>
          <p className="mt-2 text-sm text-foreground-muted">
            Metadata cannot be edited on one leg. Reverse the whole transfer group to correct its
            monetary record.
          </p>
          {transaction.status === "posted" ? (
            <Button
              type="button"
              className="mt-4"
              disabled={reverseTransfer.isPending}
              onClick={() => {
                if (transaction.transferGroupId !== undefined)
                  reverseTransfer.mutate(transaction.transferGroupId);
              }}
            >
              {reverseTransfer.isPending ? "Reversing transfer…" : "Reverse whole transfer"}
            </Button>
          ) : null}
        </section>
      ) : (
        <section className="space-y-4 rounded-xl border border-border bg-surface-elevated p-5">
          <div className="flex justify-between gap-3">
            <div>
              <h2 className="font-bold">Metadata</h2>
              <p className="mt-1 text-sm text-foreground-muted">
                Amount, type, account, and occurrence date are immutable.
              </p>
            </div>
            <Button type="button" variant="secondary" onClick={() => setEditing((value) => !value)}>
              {editing ? "Cancel" : "Edit metadata"}
            </Button>
          </div>
          {editing ? (
            <form className="space-y-4" onSubmit={submit}>
              <Input
                id="txn-description"
                label="Description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
              <div className="flex flex-col gap-1.5 font-mono text-2xs font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
                <span>Category</span>
                <CategoryPicker
                  categories={categories.data ?? []}
                  type={transaction.type}
                  value={categoryId === "" ? undefined : categoryId}
                  onChange={(next) => setCategoryId(next ?? "")}
                  description={description}
                  occurredAt={transaction.occurredAt}
                  allowUncategorized
                  label="Category"
                />
              </div>
              <Input
                id="txn-tags"
                label="Tags (comma separated)"
                value={tags}
                onChange={(event) => setTags(event.target.value)}
              />
              {error === undefined ? null : (
                <p role="alert" className="text-sm text-expense">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={update.isPending}>
                {update.isPending ? "Saving…" : "Save metadata"}
              </Button>
            </form>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {transaction.status === "posted" ? (
              <Button
                type="button"
                variant="secondary"
                disabled={reverse.isPending}
                onClick={() => reverse.mutate(transaction.id)}
              >
                {reverse.isPending ? "Recording reversal…" : "Reverse transaction"}
              </Button>
            ) : null}
            {isLinkableRecurringOccurrenceSource(transaction) ? (
              <Button type="button" variant="secondary" onClick={() => setLinkingRecurring(true)}>
                Mark as recurring payment
              </Button>
            ) : null}
            {isLinkableBillPaymentSource(transaction, accounts.data ?? []) ? (
              <Button type="button" variant="secondary" onClick={() => setLinkingBillPayment(true)}>
                Mark as credit card bill payment
              </Button>
            ) : null}
          </div>
        </section>
      )}
      {linkingRecurring ? (
        <LinkRecurringOccurrenceDialog
          transaction={transaction}
          onClose={() => setLinkingRecurring(false)}
        />
      ) : null}
      {linkingBillPayment ? (
        <LinkBillPaymentDialog
          transaction={transaction}
          accounts={accounts.data ?? []}
          onClose={() => setLinkingBillPayment(false)}
        />
      ) : null}
      <p className="text-xs text-foreground-muted">
        Money corrections create compensating entries. Ledger amounts are never edited or deleted.
      </p>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div>
      <dt className="text-xs text-foreground-muted">{label}</dt>
      <dd className="mt-1 break-words font-medium">{value}</dd>
    </div>
  );
}
