"use client";

import { formatMinor, type ReceivablePage, type ReceivableStatus } from "@treasury-ops/shared";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard, StatCardLabel, StatCardValue } from "@/components/ui/stat-card";

import { useReceivables } from "../hooks/use-receivables";
import { CreateReceivableSheet } from "./create-receivable-sheet";
import { ReceivableCard } from "./receivable-card";

const STATUS_TABS: readonly (ReceivableStatus | "all")[] = ["active", "settled", "all"];

const STATUS_TAB_LABEL: Record<ReceivableStatus | "all", string> = {
  active: "Active",
  settled: "Settled",
  cancelled: "Cancelled",
  all: "All"
};

function isValidStatusFilter(value: string | null): value is ReceivableStatus | "all" {
  return value === "active" || value === "settled" || value === "cancelled" || value === "all";
}

export function ReceivableManager({
  initialActive
}: Readonly<{ initialActive: ReceivablePage }>): ReactNode {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusParam = searchParams.get("status");
  const status: ReceivableStatus | "all" = isValidStatusFilter(statusParam)
    ? statusParam
    : "active";

  const query = { status, limit: 50 } as const;
  const receivables = useReceivables(query, status === "active" ? initialActive : undefined);
  const items = receivables.data?.items ?? [];

  const [createOpen, setCreateOpen] = useState(false);

  const totalOutstandingMinor = items.reduce((sum, item) => sum + item.outstandingMinor, 0);
  const totalReturnedMinor = items.reduce((sum, item) => sum + item.confirmedRepaidMinor, 0);
  const activeCount = items.filter((item) => item.status === "active").length;
  const now = new Date();
  const dueCount = items.filter(
    (item) =>
      item.status === "active" && item.dueAt !== undefined && item.dueAt.getTime() < now.getTime()
  ).length;

  function setStatus(next: ReceivableStatus | "all"): void {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "active") {
      params.delete("status");
    } else {
      params.set("status", next);
    }
    const nextQueryString = params.toString();
    router.push(nextQueryString === "" ? "/debts-given" : `/debts-given?${nextQueryString}`);
  }

  return (
    <section className="space-y-4.5">
      <PageHeader
        eyebrow="Net worth / debt given"
        title="Debt Given"
        description="Money you've lent to other people, tracked separately from your assets."
        action={
          <Button type="button" className="w-full sm:w-auto" onClick={() => setCreateOpen(true)}>
            <span className="mr-1 text-base leading-none">+</span> Add debt
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <StatCard padding="sm">
          <StatCardLabel>Outstanding</StatCardLabel>
          <StatCardValue>{formatMinor(totalOutstandingMinor)}</StatCardValue>
        </StatCard>
        <StatCard padding="sm">
          <StatCardLabel>Returned</StatCardLabel>
          <StatCardValue>{formatMinor(totalReturnedMinor)}</StatCardValue>
        </StatCard>
        <StatCard padding="sm">
          <StatCardLabel>Active debts</StatCardLabel>
          <StatCardValue>{activeCount}</StatCardValue>
        </StatCard>
        <StatCard padding="sm">
          <StatCardLabel>Overdue</StatCardLabel>
          {dueCount > 0 ? (
            <StatCardValue className="text-expense">{dueCount}</StatCardValue>
          ) : (
            <StatCardValue>{dueCount}</StatCardValue>
          )}
        </StatCard>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            aria-pressed={status === tab}
            onClick={() => setStatus(tab)}
            className={`inline-flex min-h-10 shrink-0 items-center rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              status === tab
                ? "border-accent bg-accent-glow text-accent shadow-xs"
                : "border-border/70 bg-surface-elevated/50 text-foreground-muted hover:border-accent/40 hover:text-foreground"
            }`}
          >
            {STATUS_TAB_LABEL[tab]}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="No debts here yet"
          description="Record money you've lent to someone to track its repayment here."
          action={
            <Button type="button" onClick={() => setCreateOpen(true)}>
              Add debt
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4.5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((receivable) => (
            <ReceivableCard key={receivable.id} receivable={receivable} />
          ))}
        </div>
      )}

      {createOpen ? <CreateReceivableSheet onClose={() => setCreateOpen(false)} /> : null}
    </section>
  );
}
