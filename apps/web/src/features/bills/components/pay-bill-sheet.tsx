"use client";

import { PayCreditCardBillSchema, type Account, type BillDetail } from "@treasury-ops/shared";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { Money, SignedMoney } from "@/components/ui/money";
import { toast } from "@/lib/toast";

import { usePayBill } from "../hooks/use-pay-bill";
import { eligiblePaymentAccounts } from "../model/bill-presentation";

const selectClasses =
  "w-full rounded-lg border border-border bg-surface-muted px-3.5 py-2.5 text-sm font-medium text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";

export function PayBillSheet({
  detail,
  accounts,
  onClose
}: Readonly<{ detail: BillDetail; accounts: readonly Account[]; onClose: () => void }>): ReactNode {
  const sources = eligiblePaymentAccounts(accounts, detail.account.id);
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? "");
  const [amountMinor, setAmountMinor] = useState(detail.bill.remainingMinor);
  const [error, setError] = useState<string>();
  const pay = usePayBill(detail.bill.id);
  const source = sources.find((account) => account.id === sourceId);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsed = PayCreditCardBillSchema.safeParse({
      fromAccountId: sourceId,
      amountMinor,
      occurredAt: new Date()
    });
    if (!parsed.success || amountMinor > detail.bill.remainingMinor) {
      setError(
        amountMinor > detail.bill.remainingMinor
          ? "Payment cannot exceed the current remaining bill."
          : (parsed.error?.issues[0]?.message ?? "Check the payment details.")
      );
      return;
    }
    try {
      const result = await pay.mutateAsync(parsed.data);
      toast.success(
        result.bill.paymentStatus === "paid" ? "Bill paid in full" : "Partial payment recorded"
      );
      onClose();
    } catch (caught: unknown) {
      const message = caught instanceof Error ? caught.message : "Could not pay this bill.";
      setError(message);
      toast.error(message);
    }
  }

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pay-bill-title"
        className="h-screen w-full max-w-md overflow-y-auto border-l border-border bg-surface-elevated p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="pay-bill-title" className="text-xl font-bold text-foreground">
              Pay credit card bill
            </h2>
            <p className="mt-1 text-sm text-foreground-muted">Destination: {detail.account.name}</p>
          </div>
          <button
            type="button"
            aria-label="Close payment"
            onClick={onClose}
            className="text-foreground-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <form className="mt-7 space-y-5" onSubmit={submit}>
          <AmountInput
            id="bill-payment-amount"
            label="Payment amount"
            value={amountMinor}
            onChange={setAmountMinor}
            {...(error === undefined ? {} : { error })}
          />

          <label className="block text-xs font-semibold text-foreground">
            Pay from
            <select
              className={`${selectClasses} mt-2`}
              value={sourceId}
              onChange={(event) => setSourceId(event.target.value)}
            >
              <option value="">Choose an account</option>
              {sources.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>

          {source === undefined ? (
            <p className="rounded-xl border border-border bg-surface-muted p-3 text-sm text-foreground-muted">
              Add an active bank, cash, or wallet account before paying this bill.
            </p>
          ) : (
            <div className="rounded-xl border border-border bg-surface-muted p-4 text-sm">
              <p className="text-foreground-muted">After this transfer</p>
              <div className="mt-2 flex items-center justify-between">
                <span>{source.name}</span>
                <SignedMoney minor={source.balanceMinor - amountMinor} size="sm" />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span>Bill remaining</span>
                <Money minor={Math.max(0, detail.bill.remainingMinor - amountMinor)} size="sm" />
              </div>
            </div>
          )}

          <p className="text-xs leading-relaxed text-foreground-muted">
            This creates an append-only transfer. Any correction happens through the existing
            reversal flow.
          </p>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                pay.isPending ||
                source === undefined ||
                amountMinor <= 0 ||
                amountMinor > detail.bill.remainingMinor
              }
            >
              {pay.isPending ? "Paying…" : "Confirm payment"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
