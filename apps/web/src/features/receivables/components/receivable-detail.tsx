"use client";

import { formatMinor, type Receivable } from "@treasury-ops/shared";
import Link from "next/link";
import { useState } from "react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { PageHeader } from "@/components/ui/page-header";

import { useReceivable } from "../hooks/use-receivable";
import {
  dueState,
  RECEIVABLE_STATUS_BADGE_VARIANT,
  RECEIVABLE_STATUS_LABEL
} from "../model/receivable-presentation";
import { CorrectReceivableDialog } from "./correct-receivable-dialog";
import { EditReceivableSheet } from "./edit-receivable-sheet";
import { ReceivableEventList } from "./receivable-event-list";
import { RecordRepaymentSheet } from "./record-repayment-sheet";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata"
});

export function ReceivableDetail({
  initialReceivable
}: Readonly<{ initialReceivable: Receivable }>): ReactNode {
  const receivable =
    useReceivable(initialReceivable.id, initialReceivable).data ?? initialReceivable;
  const [repayOpen, setRepayOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [correctOpen, setCorrectOpen] = useState(false);

  const due = dueState(receivable.dueAt, receivable.status);
  const active = receivable.status === "active";

  return (
    <section className="space-y-5">
      <Link href="/debts-given" className="text-xs font-semibold text-accent hover:underline">
        ← Debt Given
      </Link>

      <PageHeader
        eyebrow="Net worth / debt given"
        title={receivable.counterpartyName}
        description={
          receivable.isMigrated
            ? "Imported from Assets."
            : `Lent on ${dateFormatter.format(receivable.openedAt)}.`
        }
        action={
          active ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditOpen(true)}>
                Edit
              </Button>
              <Button type="button" variant="secondary" onClick={() => setCorrectOpen(true)}>
                Correct
              </Button>
              <Button type="button" onClick={() => setRepayOpen(true)}>
                Record repayment
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="glass-card flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5">
        <div>
          <p className="font-mono text-2xs font-semibold tracking-wider text-foreground-muted uppercase">
            Outstanding
          </p>
          <Money minor={receivable.outstandingMinor} size="hero" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={RECEIVABLE_STATUS_BADGE_VARIANT[receivable.status]}>
            {RECEIVABLE_STATUS_LABEL[receivable.status]}
          </Badge>
          {due === "overdue" ? <Badge variant="problem">Overdue</Badge> : null}
          {receivable.isMigrated ? <Badge variant="info">Imported from Assets</Badge> : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
        <div className="glass-card rounded-xl p-4">
          <p className="text-2xs font-semibold text-foreground-muted uppercase">Returned</p>
          <p className="mt-1 font-mono text-lg font-bold text-foreground">
            {formatMinor(receivable.confirmedRepaidMinor)}
          </p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <p className="text-2xs font-semibold text-foreground-muted uppercase">Repayments</p>
          <p className="mt-1 font-mono text-lg font-bold text-foreground">
            {receivable.repaymentCount}
          </p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <p className="text-2xs font-semibold text-foreground-muted uppercase">Due</p>
          <p className="mt-1 font-mono text-lg font-bold text-foreground">
            {receivable.dueAt === undefined ? "—" : dateFormatter.format(receivable.dueAt)}
          </p>
        </div>
      </div>

      {receivable.note === undefined ? null : (
        <p className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm text-foreground-muted">
          {receivable.note}
        </p>
      )}

      <div>
        <h2 className="text-base font-bold tracking-tight text-foreground">History</h2>
        <div className="mt-3">
          <ReceivableEventList receivableId={receivable.id} />
        </div>
      </div>

      {repayOpen ? (
        <RecordRepaymentSheet receivable={receivable} onClose={() => setRepayOpen(false)} />
      ) : null}
      {editOpen ? (
        <EditReceivableSheet receivable={receivable} onClose={() => setEditOpen(false)} />
      ) : null}
      {correctOpen ? (
        <CorrectReceivableDialog receivable={receivable} onClose={() => setCorrectOpen(false)} />
      ) : null}
    </section>
  );
}
