"use client";

import type {
  FinancialProfileState,
  SalaryStatistics,
  SalaryVersionPage
} from "@treasury-ops/shared";
import { useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/section-header";
import { toast } from "@/lib/toast";

import {
  useFinancialProfileState,
  useSalaryStatistics,
  useSalaryVersions
} from "../hooks/use-financial-profile";
import { AddSalaryChangeSheet } from "./add-salary-change-sheet";
import { SalaryHistory } from "./salary-history";
import { SalaryProfileForm } from "./salary-profile-form";
import { SalaryStatisticsPanel } from "./salary-statistics-panel";

export type SalaryWorkPanelProps = Readonly<{
  initialState: FinancialProfileState | null;
  initialStatistics: SalaryStatistics | null;
  initialHistory: SalaryVersionPage | null;
  historyPageSize: number;
}>;

/**
 * Composes the Settings "Salary & Work" section from server-rendered initial
 * data, then lets the client own interaction. Every number displayed comes
 * from the API; this component only decides which state to show.
 */
export function SalaryWorkPanel({
  initialState,
  initialStatistics,
  initialHistory,
  historyPageSize
}: SalaryWorkPanelProps): ReactNode {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const stateQuery = useFinancialProfileState(initialState);
  const statisticsQuery = useSalaryStatistics(initialStatistics);
  const historyQuery = useSalaryVersions(historyPageSize, initialHistory);

  const state = stateQuery.data ?? null;
  const versions = (historyQuery.data?.pages ?? []).flatMap((page) => page.items);
  const configured = state?.configured === true;

  function announce(message: string): void {
    setAnnouncement(message);
    toast.success(message);
  }

  if (stateQuery.isPending && state === null) {
    return (
      <section aria-busy="true" className="space-y-3">
        <p className="text-sm text-foreground-muted">Loading your salary and work profile…</p>
      </section>
    );
  }

  return (
    <div className="space-y-8">
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <section className="space-y-4">
        <SectionHeader
          title={configured ? "Salary & work" : "Set up salary & work"}
          description={
            configured
              ? "Your net in-hand salary drives every spendable-income figure in TreasuryOps. Annual CTC is stored for reference only."
              : "Add your net monthly in-hand salary and normal working hours. Nothing is assumed for you — the 160-hour figure below is a suggestion you can change before saving."
          }
          {...(configured
            ? {
                action: (
                  <Button type="button" onClick={() => setSheetOpen(true)}>
                    Add salary change
                  </Button>
                )
              }
            : {})}
        />

        {state === null ? (
          <p className="rounded-2xl border border-expense/30 bg-expense/5 px-4 py-3 text-sm text-foreground-muted">
            We could not load your salary profile just now. Reload the page to try again — nothing
            has been changed.
          </p>
        ) : (
          <SalaryProfileForm
            profile={state.profile}
            currentSalaryVersion={state.currentSalaryVersion}
            onSaved={announce}
          />
        )}
      </section>

      {configured ? (
        <section className="space-y-4">
          <SectionHeader
            title="What this salary is worth"
            description="Derived by TreasuryOps from your net in-hand salary and working hours."
          />
          <SalaryStatisticsPanel
            statistics={statisticsQuery.data ?? null}
            isLoading={statisticsQuery.isPending}
            isStale={statisticsQuery.isFetching && !statisticsQuery.isPending}
            error={statisticsQuery.error}
          />
        </section>
      ) : null}

      <section className="space-y-4">
        <SectionHeader
          title="Salary history"
          description="Newest first, and read-only: earlier versions are never rewritten, so past months keep the salary that actually applied."
        />
        <SalaryHistory
          versions={versions}
          currentVersionId={state?.currentSalaryVersion?.id ?? null}
          asOf={state?.asOf ?? new Date()}
          isLoading={historyQuery.isPending}
          hasMore={historyQuery.hasNextPage}
          isFetchingMore={historyQuery.isFetchingNextPage}
          onLoadMore={() => void historyQuery.fetchNextPage()}
          onAddSalaryChange={() => setSheetOpen(true)}
        />
      </section>

      {sheetOpen ? (
        <AddSalaryChangeSheet onClose={() => setSheetOpen(false)} onSaved={announce} />
      ) : null}
    </div>
  );
}
