"use client";

import { UpdateTransactionSchema, type Transaction } from "@vyaya/shared";
import Link from "next/link";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { useAccounts } from "@/features/accounts";
import { useCategories } from "@/features/categories";
import { useReverseTransfer } from "@/features/transfers";

import { useReverseTxn } from "../hooks/use-reverse-txn";
import { useTxn, useUpdateTxn } from "../hooks/use-txn";

const dateTime = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata"
});

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
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Could not update metadata.");
    }
  }

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <Link href="/transactions" className="text-sm text-accent">
            ← Back to transactions
          </Link>
          <h1 className="mt-3 text-3xl font-extrabold">{transaction.description}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant={transaction.status === "posted" ? "success" : "reversed"}>
              {transaction.status}
            </Badge>
            <Badge variant="pending">{transaction.source}</Badge>
            {isTransfer ? <Badge variant="success">transfer</Badge> : null}
          </div>
        </div>
        <Money
          minor={transaction.amountMinor}
          variant={transaction.type}
          signed
          className="text-xl"
        />
      </header>
      <section className="rounded-2xl border border-border bg-surface-elevated p-5">
        <h2 className="font-bold">Ledger facts</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <Fact label="Account" value={accountName} />
          <Fact label="Category" value={categoryName} />
          <Fact label="Type" value={transaction.type} />
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
      {isTransfer ? (
        <section className="rounded-2xl border border-accent/30 bg-accent/5 p-5">
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
        <section className="space-y-4 rounded-2xl border border-border bg-surface-elevated p-5">
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
              <label className="flex flex-col gap-1.5 text-xs font-semibold">
                Category
                <select
                  className="rounded-xl border border-border bg-surface px-3.5 py-2.5"
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                >
                  <option value="">No category</option>
                  {(categories.data ?? []).map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name} · {category.kind}
                    </option>
                  ))}
                </select>
              </label>
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
        </section>
      )}
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
