"use client";

import type { Account, Transaction } from "@treasury-ops/shared";
import { useState } from "react";
import type { ReactNode } from "react";

import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { DialogSurface } from "@/components/ui/dialog";
import { Money } from "@/components/ui/money";
import { Select } from "@/components/ui/select";
import { toast } from "@/lib/toast";

import { useLinkBillPayment } from "../hooks/use-link-bill-payment";
import { useOpenBills } from "../hooks/use-open-bills";
import { eligibleBillsForLinking } from "../model/bill-presentation";

export function isLinkableBillPaymentSource(
  transaction: Transaction,
  accounts: readonly Account[]
): boolean {
  if (transaction.type !== "expense") return false;
  if (transaction.status !== "posted") return false;
  if (transaction.transferGroupId !== undefined) return false;
  if (transaction.billId !== undefined) return false;
  const account = accounts.find((candidate) => candidate.id === transaction.accountId);
  return account !== undefined && !account.isArchived && account.type !== "credit_card";
}

export function LinkBillPaymentDialog({
  transaction,
  onClose
}: Readonly<{ transaction: Transaction; onClose: () => void }>): ReactNode {
  const openBills = useOpenBills();
  const eligible = eligibleBillsForLinking(openBills.data ?? [], transaction.accountId);
  const [billId, setBillId] = useState(eligible[0]?.id ?? "");
  const [amountMinor, setAmountMinor] = useState(() =>
    Math.min(transaction.amountMinor, eligible[0]?.remainingMinor ?? transaction.amountMinor)
  );
  const [error, setError] = useState<string>();
  const link = useLinkBillPayment();
  const bill = eligible.find((candidate) => candidate.id === billId);

  function selectBill(id: string): void {
    setBillId(id);
    const next = eligible.find((candidate) => candidate.id === id);
    if (next !== undefined) {
      setAmountMinor(Math.min(transaction.amountMinor, next.remainingMinor));
    }
  }

  async function submit(): Promise<void> {
    if (bill === undefined) {
      setError("Choose which bill this transaction paid.");
      return;
    }
    if (
      amountMinor <= 0 ||
      amountMinor > bill.remainingMinor ||
      amountMinor > transaction.amountMinor
    ) {
      setError("The applied amount cannot exceed either the bill remaining or this transaction.");
      return;
    }
    try {
      const result = await link.mutateAsync({
        billId: bill.id,
        transactionId: transaction.id,
        amountMinor
      });
      toast.success(
        result.bill.paymentStatus === "paid"
          ? "Credit card bill marked as paid"
          : "Payment linked to the bill"
      );
      onClose();
    } catch (caught: unknown) {
      const message = caught instanceof Error ? caught.message : "Could not link this payment.";
      setError(message);
      toast.error(message);
    }
  }

  return (
    <DialogSurface variant="drawer" labelledBy="link-bill-payment-title" onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="link-bill-payment-title" className="text-xl font-bold text-foreground">
            Mark as credit card bill payment
          </h2>
          <p className="mt-1 text-sm text-foreground-muted">
            Links this transaction as the payment leg for an open bill, without editing it.
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border bg-surface-muted text-foreground-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          ✕
        </button>
      </div>

      <div className="mt-7 space-y-5">
        {eligible.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface-muted p-3 text-sm text-foreground-muted">
            No open credit card bills to link this transaction to.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
              <span>Bill</span>
              <Select
                name="billId"
                aria-label="Bill"
                options={eligible.map((candidate) => ({
                  value: candidate.id,
                  label: `Due ${candidate.dueDate.toLocaleDateString("en-IN")} — remaining ${(candidate.remainingMinor / 100).toFixed(2)}`
                }))}
                value={billId}
                onChange={selectBill}
              />
            </div>

            <AmountInput
              id="link-bill-payment-amount"
              label="Amount applied to the bill"
              value={amountMinor}
              onChange={setAmountMinor}
              {...(error === undefined ? {} : { error })}
            />

            {bill === undefined ? null : (
              <div className="rounded-xl border border-border bg-surface-muted p-4 text-sm">
                <div className="flex items-center justify-between">
                  <span>Bill remaining after this</span>
                  <Money minor={Math.max(0, bill.remainingMinor - amountMinor)} size="sm" />
                </div>
              </div>
            )}
          </>
        )}

        <p className="text-xs leading-relaxed text-foreground-muted">
          This transaction stays exactly as posted. Linking only adds the matching credit-side entry
          on the card account, the same way the in-app &ldquo;Pay bill&rdquo; flow does.
        </p>

        <div className="safe-area-bottom sticky bottom-0 flex gap-2 border-t border-border bg-surface-elevated/95 pt-4 backdrop-blur sm:justify-end">
          <Button
            className="flex-1 sm:flex-none"
            type="button"
            variant="secondary"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 sm:flex-none"
            type="button"
            disabled={link.isPending || bill === undefined || amountMinor <= 0}
            onClick={() => {
              void submit();
            }}
          >
            {link.isPending ? "Linking…" : "Link payment"}
          </Button>
        </div>
      </div>
    </DialogSurface>
  );
}
