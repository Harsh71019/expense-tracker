"use client";

import type { BillStatementUpload, Transaction } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { toast } from "@/lib/toast";

import { useAcknowledgeExtraTransaction } from "../hooks/use-bill-reconciliation";
import { formatBillDate } from "../model/bill-presentation";

function ExtraLedgerRow({
  billId,
  upload,
  transaction,
  readOnly
}: Readonly<{
  billId: string;
  upload: BillStatementUpload;
  transaction: Transaction;
  readOnly: boolean;
}>): ReactNode {
  const acknowledge = useAcknowledgeExtraTransaction(billId);
  const reviewed = upload.acknowledgedExtraTransactionIds.includes(transaction.id);

  async function toggle(): Promise<void> {
    try {
      await acknowledge.mutateAsync({ transactionId: transaction.id, acknowledged: !reviewed });
      toast.success(reviewed ? "Review mark removed" : "Extra ledger entry reviewed");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not update this warning.");
    }
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-muted p-3.5">
      <div>
        <p className="text-sm font-semibold text-foreground">{transaction.description}</p>
        <p className="mt-1 text-xs text-foreground-muted">
          {formatBillDate(transaction.occurredAt)} · only in your ledger
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Money minor={transaction.amountMinor} />
        {readOnly ? (
          <span className="text-xs text-foreground-muted">
            {reviewed ? "Reviewed" : "Not reviewed"}
          </span>
        ) : (
          <Button
            type="button"
            variant="secondary"
            disabled={acknowledge.isPending}
            onClick={() => void toggle()}
          >
            {reviewed ? "Mark unreviewed" : "Mark reviewed"}
          </Button>
        )}
      </div>
    </li>
  );
}

export function ExtraLedgerList({
  billId,
  upload,
  transactions,
  readOnly
}: Readonly<{
  billId: string;
  upload: BillStatementUpload;
  transactions: readonly Transaction[];
  readOnly: boolean;
}>): ReactNode {
  if (transactions.length === 0) return null;
  return (
    <section className="mt-6">
      <h3 className="text-sm font-bold text-foreground">Only in your ledger</h3>
      <p className="mt-1 text-xs text-foreground-muted">
        These warnings do not block reconciliation, but should be consciously reviewed.
      </p>
      <ul className="mt-3 space-y-2">
        {transactions.map((transaction) => (
          <ExtraLedgerRow
            key={transaction.id}
            billId={billId}
            upload={upload}
            transaction={transaction}
            readOnly={readOnly}
          />
        ))}
      </ul>
    </section>
  );
}
