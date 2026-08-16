"use client";

import { formatMinor, type Account, type Transaction } from "@treasury-ops/shared";
import { useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { DialogSurface } from "@/components/ui/dialog";
import { Money } from "@/components/ui/money";
import { Select } from "@/components/ui/select";
import { toast } from "@/lib/toast";

import { useLinkBillPayment } from "../hooks/use-link-bill-payment";
import { useOpenBills } from "../hooks/use-open-bills";
import { eligibleBillsForCardPayment } from "../model/bill-presentation";

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
  accounts,
  onClose
}: Readonly<{
  transaction: Transaction;
  accounts: readonly Account[];
  onClose: () => void;
}>): ReactNode {
  const cardAccounts = accounts.filter(
    (account) => account.type === "credit_card" && !account.isArchived
  );
  const sourceAccount = accounts.find((account) => account.id === transaction.accountId);
  const [creditCardAccountId, setCreditCardAccountId] = useState(cardAccounts[0]?.id ?? "");
  const [selectedBillId, setSelectedBillId] = useState<string>();
  const [error, setError] = useState<string>();
  const openBills = useOpenBills();
  const link = useLinkBillPayment();
  const card = cardAccounts.find((account) => account.id === creditCardAccountId);
  const eligibleBills = eligibleBillsForCardPayment(
    openBills.data ?? [],
    creditCardAccountId,
    transaction.amountMinor
  );
  const billId = selectedBillId ?? eligibleBills[0]?.id ?? "";
  const bill = eligibleBills.find((candidate) => candidate.id === billId);
  const nextCardBalanceMinor = (card?.balanceMinor ?? 0) + transaction.amountMinor;
  const outstandingBeforeMinor = Math.max(0, -(card?.balanceMinor ?? 0));
  const outstandingAfterMinor = Math.max(0, -nextCardBalanceMinor);
  const creditAfterMinor = Math.max(0, nextCardBalanceMinor);

  async function submit(): Promise<void> {
    if (card === undefined) {
      setError("Choose the credit card this payment was made for.");
      return;
    }
    try {
      const result = await link.mutateAsync({
        transactionId: transaction.id,
        creditCardAccountId: card.id,
        ...(bill === undefined ? {} : { billId: bill.id })
      });
      toast.success(
        result.bill?.paymentStatus === "paid"
          ? "Card balance updated and bill marked paid"
          : result.bill === undefined
            ? "Credit card balance updated"
            : "Card balance and bill payment updated"
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
          <p className="font-mono text-2xs font-extrabold tracking-[0.22em] text-income uppercase">
            Balance correction
          </p>
          <h2 id="link-bill-payment-title" className="mt-1 text-xl font-bold text-foreground">
            Mark as credit card payment
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-foreground-muted">
            Choose the card that received this payment. The existing debit will not be charged
            again.
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
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl border border-border bg-surface-muted p-4">
          <div className="min-w-0">
            <p className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
              Existing debit
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-foreground">
              {sourceAccount?.name ?? "Source account"}
            </p>
          </div>
          <span aria-hidden="true" className="text-lg text-income">
            →
          </span>
          <div className="min-w-0 text-right">
            <p className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
              Card credit
            </p>
            <div className="mt-1">
              <Money minor={transaction.amountMinor} variant="income" signed size="sm" />
            </div>
          </div>
        </div>

        {cardAccounts.length === 0 ? (
          <p className="rounded-xl border border-warning/25 bg-warning/10 p-3 text-sm text-warning">
            Create an active credit-card account before marking this payment.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
              <span>Credit card</span>
              <Select
                name="creditCardAccountId"
                aria-label="Credit card"
                options={cardAccounts.map((account) => ({
                  value: account.id,
                  label: account.name
                }))}
                value={creditCardAccountId}
                onChange={(value) => {
                  setCreditCardAccountId(value);
                  setSelectedBillId(undefined);
                  setError(undefined);
                }}
              />
            </div>

            {card === undefined ? null : (
              <div className="rounded-xl border border-income/25 bg-income/5 p-4">
                <p className="font-mono text-2xs font-extrabold tracking-[0.2em] text-income uppercase">
                  Projected outstanding
                </p>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs text-foreground-muted">Before</p>
                    <Money minor={outstandingBeforeMinor} size="sm" />
                  </div>
                  <span aria-hidden="true" className="pb-0.5 text-foreground-muted">
                    →
                  </span>
                  <div className="text-right">
                    <p className="text-xs text-foreground-muted">After payment</p>
                    <Money minor={outstandingAfterMinor} variant="income" size="lg" />
                  </div>
                </div>
                {creditAfterMinor === 0 ? null : (
                  <p className="mt-2 text-right text-xs text-foreground-muted">
                    Includes a {formatMinor(creditAfterMinor)} card credit.
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
              <span>Bill tracking (optional)</span>
              <Select
                name="billId"
                aria-label="Bill tracking"
                options={[
                  { value: "", label: "Update card balance only" },
                  ...eligibleBills.map((candidate) => ({
                    value: candidate.id,
                    label: `Due ${candidate.dueDate.toLocaleDateString("en-IN")} · ${formatMinor(candidate.remainingMinor)} remaining`
                  }))
                ]}
                value={billId}
                onChange={setSelectedBillId}
              />
              {openBills.isLoading ? (
                <p className="font-normal text-foreground-muted">Checking open bills…</p>
              ) : eligibleBills.length === 0 ? (
                <p className="font-normal text-foreground-muted">
                  No matching open bill is required; the card balance will still be updated.
                </p>
              ) : bill === undefined ? null : (
                <p className="font-normal text-foreground-muted">
                  Bill remaining after payment:{" "}
                  {formatMinor(bill.remainingMinor - transaction.amountMinor)}
                </p>
              )}
            </div>
          </>
        )}

        {error === undefined ? null : (
          <p role="alert" className="text-sm text-expense">
            {error}
          </p>
        )}

        <p className="text-xs leading-relaxed text-foreground-muted">
          TreasuryOps keeps the original transaction unchanged and appends one equal card-side
          income leg. Together they become a balanced, reversible transfer.
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
            disabled={link.isPending || card === undefined}
            onClick={() => {
              void submit();
            }}
          >
            {link.isPending ? "Updating card…" : "Confirm card payment"}
          </Button>
        </div>
      </div>
    </DialogSurface>
  );
}
