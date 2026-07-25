"use client";

import type { Account, BillDetail as BillDetailModel } from "@treasury-ops/shared";
import Link from "next/link";
import { useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

import { useBillDetail } from "../hooks/use-bill-detail";
import { reconciliationGate } from "../model/reconciliation";
import { BillLifecycle } from "./bill-lifecycle";
import { BillSummary } from "./bill-summary";
import { PayBillSheet } from "./pay-bill-sheet";
import { ReconcileConfirmDialog } from "./reconcile-confirm-dialog";
import { ReconciliationTable } from "./reconciliation-table";
import { StatementUploadStep } from "./statement-upload-step";

export function BillDetail({
  initialDetail,
  accounts
}: Readonly<{ initialDetail: BillDetailModel; accounts: Account[] }>): ReactNode {
  const query = useBillDetail(initialDetail.bill.id, initialDetail);
  const detail = query.data ?? initialDetail;
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const gate = reconciliationGate(detail);
  const statement = detail.activeStatement;

  return (
    <div className="space-y-5">
      <Link href="/bills" className="inline-flex text-sm font-semibold text-accent hover:underline">
        ← Back to bills
      </Link>

      <BillSummary detail={detail} />
      <BillLifecycle detail={detail} />

      {query.isError ? (
        <div role="alert" className="rounded-xl border border-expense/30 bg-expense/10 p-4">
          <p className="font-semibold text-expense">Could not refresh this bill</p>
          <p className="mt-1 text-sm text-foreground-muted">{query.error.message}</p>
        </div>
      ) : null}

      {detail.bill.reconciliationStatus === "awaiting_statement" &&
      (statement === undefined || statement.status === "failed") ? (
        <>
          {statement?.status === "failed" ? (
            <p
              role="alert"
              className="rounded-xl border border-expense/30 bg-expense/10 p-4 text-sm text-expense"
            >
              The statement could not be parsed. Check the CSV and mapping, then upload it again.
            </p>
          ) : null}
          <StatementUploadStep billId={detail.bill.id} />
        </>
      ) : null}

      {statement?.status === "pending" ? (
        <section
          aria-live="polite"
          className="rounded-2xl border border-accent/30 bg-accent-glow p-6"
        >
          <h2 className="text-lg font-bold text-foreground">Verifying statement…</h2>
          <p className="mt-2 text-sm text-foreground-muted">
            The worker is parsing and matching rows. This page refreshes automatically and is safe
            to close.
          </p>
        </section>
      ) : null}

      {statement?.status === "staged" ? <ReconciliationTable detail={detail} /> : null}

      {detail.bill.reconciliationStatus === "awaiting_statement" &&
      statement?.status === "staged" ? (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-surface-elevated p-5">
          <div>
            <h2 className="font-bold text-foreground">Reconciliation gate</h2>
            <p className="mt-1 text-sm text-foreground-muted">
              {gate.unresolved === 0
                ? "Every issuer row is matched or acknowledged."
                : `${gate.unresolved} statement row${gate.unresolved === 1 ? "" : "s"} still need attention.`}
            </p>
          </div>
          <Button
            type="button"
            disabled={!gate.canReconcile}
            onClick={() => setReconcileOpen(true)}
          >
            Reconcile statement
          </Button>
        </section>
      ) : null}

      {detail.bill.reconciliationStatus === "reconciled" && detail.bill.paymentStatus !== "paid" ? (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-accent/30 bg-accent-glow p-5">
          <div>
            <h2 className="font-bold text-foreground">Statement verified</h2>
            <p className="mt-1 text-sm text-foreground-muted">
              Payment is unlocked. Partial payments are supported.
            </p>
          </div>
          <Button type="button" onClick={() => setPayOpen(true)}>
            Pay remaining bill
          </Button>
        </section>
      ) : null}

      {detail.bill.paymentStatus === "paid" ? (
        <section className="rounded-2xl border border-income/30 bg-income/10 p-6">
          <h2 className="text-lg font-bold text-foreground">Paid in full</h2>
          <p className="mt-1 text-sm text-foreground-muted">
            Payment state is derived from the ledger and will update automatically after a reversal.
          </p>
        </section>
      ) : null}

      {reconcileOpen ? (
        <ReconcileConfirmDialog detail={detail} onClose={() => setReconcileOpen(false)} />
      ) : null}
      {payOpen ? (
        <PayBillSheet detail={detail} accounts={accounts} onClose={() => setPayOpen(false)} />
      ) : null}
    </div>
  );
}
