"use client";

import type { Asset, DeclaredDebt, DeclaredDebtPage, ProtectionState } from "@treasury-ops/shared";
import { useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/section-header";
import { toast } from "@/lib/toast";

import { useDeclaredDebts } from "../hooks/use-debt-profile";
import { useProtectionState } from "../hooks/use-protection";
import { DebtFormSheet } from "./debt-form-sheet";
import { DebtInventory } from "./debt-inventory";
import { ProtectionDataNotice } from "./protection-data-notice";
import { ProtectionProfileForm } from "./protection-profile-form";
import { ProtectionSummary } from "./protection-summary";
import { ResolveDebtDialog } from "./resolve-debt-dialog";

export type ProtectionDebtPanelProps = Readonly<{
  initialProtection: ProtectionState | null;
  initialDebts: DeclaredDebtPage | null;
  initialAssets: readonly Asset[];
  debtPageSize: number;
}>;

/**
 * Composes the Settings "Protection & Debt" section from server-rendered
 * initial data, then lets the client own interaction. Every state shown here is
 * derived by the API; this component only decides which one to render.
 */
export function ProtectionDebtPanel({
  initialProtection,
  initialDebts,
  initialAssets,
  debtPageSize
}: ProtectionDebtPanelProps): ReactNode {
  const [debtSheetOpen, setDebtSheetOpen] = useState(false);
  const [debtToResolve, setDebtToResolve] = useState<DeclaredDebt | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const protectionQuery = useProtectionState(initialProtection);
  const debtsQuery = useDeclaredDebts({ status: "active", limit: debtPageSize }, initialDebts);

  const protection = protectionQuery.data ?? null;

  function announce(message: string): void {
    setAnnouncement(message);
    toast.success(message);
  }

  if (protectionQuery.isPending && protection === null) {
    return (
      <section aria-busy="true" className="space-y-3">
        <p className="text-sm text-foreground-muted">Loading your protection and debt answers…</p>
      </section>
    );
  }

  return (
    <div className="space-y-8">
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <ProtectionDataNotice />

      <section className="space-y-4">
        <SectionHeader
          title="Protection you already have"
          description="What TreasuryOps has on file today. Missing answers stay visible as unknown rather than being read as covered."
        />
        <ProtectionSummary state={protection} />
      </section>

      <section className="space-y-4">
        <SectionHeader
          title={protection?.configured === true ? "Update your answers" : "Record your answers"}
          description="Saving appends a new dated set of answers. Earlier answers are never rewritten, so past months keep the facts that actually applied."
        />
        {protection === null ? (
          <p className="rounded-2xl border border-expense/30 bg-expense/5 px-4 py-3 text-sm text-foreground-muted">
            The protection form is unavailable until your answers load. Reload the page to try again
            — nothing has been changed.
          </p>
        ) : (
          <ProtectionProfileForm snapshot={protection.currentSnapshot} onSaved={announce} />
        )}
      </section>

      <section className="space-y-4">
        <SectionHeader
          title="High-cost debt"
          description="Declared debts used for planning only. Nothing here posts a transaction, schedules a payment, or changes an account balance."
          action={
            <Button type="button" onClick={() => setDebtSheetOpen(true)}>
              Add a debt
            </Button>
          }
        />
        <DebtInventory
          page={debtsQuery.data ?? null}
          isLoading={debtsQuery.isPending}
          onAddDebt={() => setDebtSheetOpen(true)}
          onResolveDebt={setDebtToResolve}
        />
      </section>

      {debtSheetOpen ? (
        <DebtFormSheet
          assets={initialAssets}
          onClose={() => setDebtSheetOpen(false)}
          onSaved={announce}
        />
      ) : null}

      {debtToResolve === null ? null : (
        <ResolveDebtDialog
          debt={debtToResolve}
          onClose={() => setDebtToResolve(null)}
          onResolved={announce}
        />
      )}
    </div>
  );
}
