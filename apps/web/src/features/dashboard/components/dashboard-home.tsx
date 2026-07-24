"use client";

import type { Account, AccountType, RecentActivityItem } from "@treasury-ops/shared";
import { useState } from "react";
import type { ReactNode } from "react";

import { useAccounts } from "@/features/accounts";

import { useRecentActivity } from "../hooks/use-recent-activity";
import { AccountsPanel } from "./accounts-panel";
import { BalanceCard } from "./balance-card";
import { CreateAccountModal } from "./create-account-modal";
import { QuickAddPanel } from "./quick-add-panel";
import { RecentActivityPanel } from "./recent-activity-panel";
import { ZeroState } from "./zero-state";

const RECENT_ACTIVITY_LIMIT = 5;

type DashboardHomeProps = Readonly<{
  email: string;
  initialAccounts: Account[];
  initialRecentActivity: RecentActivityItem[];
}>;

export function DashboardHome({
  email,
  initialAccounts,
  initialRecentActivity
}: DashboardHomeProps): ReactNode {
  const accountsQuery = useAccounts(initialAccounts);
  const recentActivityQuery = useRecentActivity(RECENT_ACTIVITY_LIMIT, initialRecentActivity);
  const accounts = accountsQuery.data ?? initialAccounts;
  const recentActivity = recentActivityQuery.data ?? initialRecentActivity;
  const active = accounts.filter((account) => !account.isArchived);
  const isEmpty = active.length === 0;

  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<AccountType>("bank");

  function openCreate(type: AccountType): void {
    setModalType(type);
    setModalOpen(true);
  }

  return (
    <section className="flex flex-col gap-8">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {isEmpty ? "Welcome to Ledger" : "Home"}
        </h1>
        <p className="truncate font-mono text-[11px] text-foreground-muted">{email}</p>
      </div>

      {isEmpty ? (
        <ZeroState onOpenCreate={openCreate} />
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[1.4fr_1fr]">
          <div className="flex flex-col gap-5">
            <BalanceCard accounts={accounts} />
            <AccountsPanel accounts={accounts} onAddAccount={() => openCreate("bank")} />
            <RecentActivityPanel items={recentActivity} />
          </div>
          <QuickAddPanel accounts={active} />
        </div>
      )}

      <CreateAccountModal
        open={modalOpen}
        initialType={modalType}
        onClose={() => setModalOpen(false)}
      />
    </section>
  );
}
