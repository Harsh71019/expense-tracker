"use client";

import {
  CreateAccountSchema,
  CreditCardConfigInputSchema,
  type Account,
  type AccountType
} from "@treasury-ops/shared";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { DialogSurface } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Money, SignedMoney } from "@/components/ui/money";
import { userErrorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { formatBillDate } from "@/features/bills/model/bill-presentation";

import { useAccounts } from "../hooks/use-accounts";
import { useArchiveAccount } from "../hooks/use-archive-account";
import { useCreateAccount } from "../hooks/use-create-account";
import { useUpdateCreditCardConfig } from "../hooks/use-update-credit-card-config";
import { AccountDetailDialog } from "./account-detail-dialog";

type TypeMeta = {
  value: AccountType;
  label: string;
  filterLabel: string;
  icon: string;
  badgeStyle: string;
};

const accountTypes: readonly TypeMeta[] = [
  {
    value: "bank",
    label: "Bank",
    filterLabel: "Bank",
    icon: "🏦",
    badgeStyle:
      "bg-gradient-to-br from-blue-500/15 to-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/25"
  },
  {
    value: "credit_card",
    label: "Credit card",
    filterLabel: "Cards",
    icon: "💳",
    badgeStyle:
      "bg-gradient-to-br from-amber-500/15 to-orange-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25"
  },
  {
    value: "cash",
    label: "Cash",
    filterLabel: "Cash",
    icon: "💵",
    badgeStyle:
      "bg-gradient-to-br from-emerald-500/15 to-teal-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25"
  },
  {
    value: "wallet",
    label: "Wallet",
    filterLabel: "Wallets",
    icon: "👛",
    badgeStyle:
      "bg-gradient-to-br from-purple-500/15 to-indigo-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/25"
  },
  {
    value: "investment",
    label: "Investment",
    filterLabel: "Investments",
    icon: "📈",
    badgeStyle:
      "bg-gradient-to-br from-fuchsia-500/15 to-pink-500/15 text-fuchsia-600 dark:text-fuchsia-400 border border-fuchsia-500/25"
  }
];

function typeMeta(type: AccountType): TypeMeta {
  const meta = accountTypes.find((entry) => entry.value === type);
  if (meta === undefined) throw new Error(`Unknown account type: ${type}`);
  return meta;
}

type Filter = "all" | AccountType;

const pillClasses = (active: boolean): string =>
  [
    "inline-flex items-center gap-1.5 min-h-10 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent select-none",
    active
      ? "border border-accent bg-accent-glow text-accent shadow-sm"
      : "border border-border/70 bg-surface-elevated/50 text-foreground-muted hover:border-accent/40 hover:text-foreground"
  ].join(" ");

export function AccountManager({ initialAccounts }: { initialAccounts: Account[] }): ReactNode {
  const accounts = useAccounts(initialAccounts);
  const createAccount = useCreateAccount();
  const archiveAccount = useArchiveAccount();
  const updateCardConfig = useUpdateCreditCardConfig();
  const [createOpen, setCreateOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("bank");
  const [amountMinor, setAmountMinor] = useState(0);
  const [direction, setDirection] = useState<"available" | "owed">("available");
  const [statementDay, setStatementDay] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [confirming, setConfirming] = useState<Account>();
  const [configuring, setConfiguring] = useState<Account>();
  const [detailAccount, setDetailAccount] = useState<Account>();
  const [error, setError] = useState<string>();

  function openCreate(): void {
    setName("");
    setAmountMinor(0);
    setDirection("available");
    setType("bank");
    setStatementDay("");
    setDueDay("");
    setError(undefined);
    setCreateOpen(true);
  }

  function closeCreate(): void {
    setCreateOpen(false);
    setStatementDay("");
    setDueDay("");
    setError(undefined);
  }

  function selectType(nextType: AccountType): void {
    setType(nextType);
    if (nextType !== "credit_card") {
      setStatementDay("");
      setDueDay("");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsed = CreateAccountSchema.safeParse({
      name,
      type,
      openingBalanceMinor: direction === "owed" ? -amountMinor : amountMinor,
      ...(type === "credit_card"
        ? {
            creditCardConfig: {
              statementDay: Number(statementDay),
              dueDay: Number(dueDay)
            }
          }
        : {})
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the account details.");
      return;
    }
    try {
      await createAccount.mutateAsync(parsed.data);
      closeCreate();
      setError(undefined);
      toast.success("Account created");
    } catch (caught: unknown) {
      const message = userErrorMessage(caught, "Could not create this account.");
      setError(message);
      toast.error(message);
    }
  }

  function openCardConfig(account: Account): void {
    setConfiguring(account);
    setStatementDay(account.creditCardConfig?.statementDay.toString() ?? "");
    setDueDay(account.creditCardConfig?.dueDay.toString() ?? "");
    setError(undefined);
  }

  async function saveCardConfig(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (configuring === undefined) return;
    const parsed = CreditCardConfigInputSchema.safeParse({
      statementDay: Number(statementDay),
      dueDay: Number(dueDay)
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the billing cycle.");
      return;
    }
    try {
      await updateCardConfig.mutateAsync({ accountId: configuring.id, config: parsed.data });
      setConfiguring(undefined);
      setError(undefined);
      toast.success("Billing cycle updated");
    } catch (caught: unknown) {
      const message = userErrorMessage(caught, "Could not update the billing cycle.");
      setError(message);
      toast.error(message);
    }
  }

  async function archive(): Promise<void> {
    if (confirming === undefined) return;
    try {
      await archiveAccount.mutateAsync(confirming.id);
      setConfirming(undefined);
      setError(undefined);
      toast.success("Account archived");
    } catch (caught: unknown) {
      const message = userErrorMessage(caught, "Could not archive this account.");
      setError(message);
      toast.error(message);
    }
  }

  const items = accounts.data ?? initialAccounts;
  const active = items.filter((account) => !account.isArchived);
  const hasArchived = items.some((account) => account.isArchived);
  const assetsTotal = active
    .filter((account) => account.balanceMinor >= 0)
    .reduce((sum, account) => sum + account.balanceMinor, 0);
  const liabilitiesTotal = active
    .filter((account) => account.balanceMinor < 0)
    .reduce((sum, account) => sum + account.balanceMinor, 0);
  const netWorth = active.reduce((sum, account) => sum + account.balanceMinor, 0);

  const typeCounts = active.reduce<Record<AccountType, number>>(
    (acc, accItem) => {
      acc[accItem.type] = (acc[accItem.type] ?? 0) + 1;
      return acc;
    },
    { bank: 0, credit_card: 0, cash: 0, wallet: 0, investment: 0 }
  );

  let visible = showArchived ? items : active;
  if (filter !== "all") visible = visible.filter((account) => account.type === filter);
  if (searchQuery.trim() !== "") {
    const q = searchQuery.toLowerCase().trim();
    visible = visible.filter((account) => account.name.toLowerCase().includes(q));
  }

  return (
    <section className="space-y-8">
      <header className="flex flex-col items-stretch gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-accent uppercase">
            Expense tracker
          </p>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Accounts
          </h1>
          <p className="mt-1.5 max-w-md text-sm text-foreground-muted">
            The containers your money lives in. Balances update automatically as transactions post.
          </p>
        </div>
        <Button className="w-full sm:w-auto" type="button" onClick={openCreate}>
          <span className="mr-1 text-base leading-none">+</span> New account
        </Button>
      </header>

      {items.length === 0 ? null : (
        <div className="relative overflow-hidden rounded-2xl border border-border bg-surface-elevated/80 backdrop-blur p-6 sm:p-7 shadow-xs">
          <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-accent-glow opacity-60 blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="font-mono text-[10px] font-bold tracking-[0.15em] text-foreground-muted uppercase">
                  Net Worth Overview
                </p>
                <span className="inline-flex items-center rounded-full bg-accent-glow px-2 py-0.5 font-mono text-[10px] font-semibold text-accent">
                  {active.length} {active.length === 1 ? "active account" : "active accounts"}
                </span>
              </div>
              <div className="pt-1">
                <SignedMoney minor={netWorth} size="hero" />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex-1 sm:flex-none min-w-[140px] rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] font-bold tracking-wider text-emerald-600 dark:text-emerald-400 uppercase">
                    Assets
                  </span>
                  <span className="text-xs text-emerald-500">↗</span>
                </div>
                <div className="mt-1">
                  <Money minor={assetsTotal} size="lg" />
                </div>
              </div>

              <div className="flex-1 sm:flex-none min-w-[140px] rounded-xl border border-rose-500/20 bg-rose-500/5 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] font-bold tracking-wider text-rose-600 dark:text-rose-400 uppercase">
                    Liabilities
                  </span>
                  <span className="text-xs text-rose-500">↘</span>
                </div>
                <div className="mt-1">
                  <Money
                    minor={Math.abs(liabilitiesTotal)}
                    variant={liabilitiesTotal < 0 ? "expense" : "neutral"}
                    size="lg"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {items.length === 0 ? null : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={pillClasses(filter === "all")}
            >
              <span>All</span>
              <span className="rounded-md bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground-muted">
                {active.length}
              </span>
            </button>
            {accountTypes.map((meta) => {
              const count = typeCounts[meta.value];
              return (
                <button
                  key={meta.value}
                  type="button"
                  onClick={() => setFilter(meta.value)}
                  className={pillClasses(filter === meta.value)}
                >
                  <span>{meta.filterLabel}</span>
                  {count > 0 ? (
                    <span className="rounded-md bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground-muted">
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <div className="relative flex-1 sm:w-56 sm:flex-none">
              <Input
                id="search-accounts"
                label="Search accounts"
                placeholder="Search accounts…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 text-xs"
              />
            </div>
            {hasArchived ? (
              <label className="flex items-center gap-2 text-xs font-medium text-foreground-muted select-none cursor-pointer hover:text-foreground">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(event) => setShowArchived(event.target.checked)}
                  className="h-4 w-4 rounded accent-accent"
                />
                Show archived
              </label>
            ) : null}
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          title="No accounts yet"
          description="Accounts are where every transaction, transfer, and import lands. Create your first one to start tracking."
          action={
            <Button type="button" onClick={openCreate}>
              <span className="mr-1 text-base leading-none">+</span> Create account
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title="No matching accounts"
          description="Try a different filter or search term."
        />
      ) : (
        <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((account) => {
            const meta = typeMeta(account.type);
            return (
              <article
                key={account.id}
                className={`group relative flex flex-col justify-between rounded-2xl border border-border/80 bg-surface-elevated p-5 shadow-xs transition-all duration-200 hover:border-accent/40 hover:shadow-md ${
                  account.isArchived ? "opacity-60" : ""
                }`}
              >
                <button
                  type="button"
                  aria-label={`View details for ${account.name}`}
                  onClick={() => setDetailAccount(account)}
                  className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                />

                <div className="pointer-events-none relative z-10 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-xl ${meta.badgeStyle}`}
                      >
                        {meta.icon}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-base font-bold text-foreground tracking-tight">
                          {account.name}
                        </p>
                        <p className="mt-0.5 font-mono text-[10px] font-semibold tracking-wider text-foreground-muted uppercase">
                          {meta.label}
                        </p>
                      </div>
                    </div>
                    {account.isArchived ? (
                      <span className="shrink-0 rounded-md border border-border bg-surface-muted px-2 py-0.5 font-mono text-[9px] font-bold tracking-wider text-foreground-muted">
                        ARCHIVED
                      </span>
                    ) : null}
                  </div>

                  <div className="rounded-xl border border-border/60 bg-surface-muted/50 p-3.5">
                    <p className="font-mono text-[9px] font-extrabold tracking-[0.15em] text-foreground-muted uppercase">
                      Current Balance
                    </p>
                    <div className="mt-1">
                      <SignedMoney minor={account.balanceMinor} size="lg" />
                    </div>
                  </div>
                </div>

                <div className="pointer-events-none relative z-10 mt-4 border-t border-border/60 pt-3.5 flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-mono text-[10px] text-foreground-muted">
                      Opening <SignedMoney minor={account.openingBalanceMinor} size="sm" />
                    </span>
                    {account.type === "credit_card" && account.creditCardConfig !== undefined ? (
                      <span className="inline-flex items-center rounded-md bg-accent-glow/50 px-2 py-0.5 font-mono text-[10px] text-accent">
                        Next stmt: {formatBillDate(account.creditCardConfig.nextStatementAt)}
                      </span>
                    ) : null}
                  </div>

                  {account.type === "credit_card" ? (
                    <p className="text-xs text-foreground-muted">
                      {account.creditCardConfig === undefined
                        ? "Billing cycle not configured"
                        : `Statement day ${account.creditCardConfig.statementDay} · due day ${account.creditCardConfig.dueDay}`}
                    </p>
                  ) : null}

                  {account.isArchived ? null : (
                    <div className="pointer-events-auto flex items-center justify-end gap-2 pt-1">
                      {account.type === "credit_card" ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openCardConfig(account);
                          }}
                          className="min-h-9 rounded-lg px-2.5 text-xs font-semibold text-accent hover:bg-accent-glow hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          {account.creditCardConfig === undefined
                            ? "Set billing cycle"
                            : "Edit billing cycle"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setConfirming(account);
                        }}
                        className="min-h-9 rounded-lg px-2.5 text-xs font-medium text-foreground-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        Archive
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {createOpen ? (
        <DialogSurface
          labelledBy="create-account-title"
          onClose={closeCreate}
          panelClassName="max-w-md"
        >
          <h2 id="create-account-title" className="text-lg font-bold text-foreground">
            New account
          </h2>
          <p className="mt-1 text-sm text-foreground-muted">
            Name, type, and opening balance are set once and can&apos;t be changed later.
          </p>

          <form className="mt-6 space-y-5" onSubmit={submit}>
            <Input
              id="account-name"
              label="Account name"
              value={name}
              name="accountName"
              autoComplete="off"
              onChange={(event) => setName(event.target.value)}
              placeholder="HDFC Savings…"
              maxLength={80}
            />

            <div>
              <p className="font-mono text-[9px] font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
                Type
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                {accountTypes.map((meta) => (
                  <button
                    key={meta.value}
                    type="button"
                    onClick={() => selectType(meta.value)}
                    className={`flex min-h-11 flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-[11px] font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      type === meta.value
                        ? "border-accent bg-accent-glow text-accent"
                        : "border-border bg-surface text-foreground-muted"
                    }`}
                  >
                    <span className="text-lg leading-none">{meta.icon}</span>
                    <span>{meta.filterLabel}</span>
                  </button>
                ))}
              </div>
            </div>

            {type === "credit_card" ? (
              <div className="rounded-xl border border-border bg-surface-muted p-4">
                <p className="text-sm font-semibold text-foreground">Billing cycle</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Input
                    id="statement-day"
                    label="Statement day"
                    type="number"
                    name="statementDay"
                    inputMode="numeric"
                    autoComplete="off"
                    min={1}
                    max={31}
                    value={statementDay}
                    onChange={(event) => setStatementDay(event.target.value)}
                  />
                  <Input
                    id="due-day"
                    label="Due day"
                    type="number"
                    name="dueDay"
                    inputMode="numeric"
                    autoComplete="off"
                    min={1}
                    max={31}
                    value={dueDay}
                    onChange={(event) => setDueDay(event.target.value)}
                  />
                </div>
                <p className="mt-2 text-xs leading-relaxed text-foreground-muted">
                  Days 29–31 automatically clamp to the last calendar day in shorter months.
                </p>
              </div>
            ) : null}

            <div>
              <AmountInput
                id="opening-balance"
                label="Opening balance"
                value={amountMinor}
                onChange={setAmountMinor}
              />
              <div className="mt-3 flex justify-center gap-2">
                {(["available", "owed"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDirection(value)}
                    className={`min-h-11 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      direction === value
                        ? value === "owed"
                          ? "border border-expense/40 bg-expense/10 text-expense"
                          : "border border-accent bg-accent-glow text-accent"
                        : "border border-border text-foreground-muted"
                    }`}
                  >
                    {value === "available" ? "+ Available" : "− Owed"}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-center text-xs text-foreground-muted">
                Use owed for accounts that start in debt, like a credit card.
              </p>
            </div>

            {error === undefined ? null : (
              <p role="alert" className="text-sm text-expense">
                {error}
              </p>
            )}

            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
              <Button
                className="w-full sm:w-auto"
                type="button"
                variant="secondary"
                onClick={closeCreate}
              >
                Cancel
              </Button>
              <Button className="w-full sm:w-auto" type="submit" disabled={createAccount.isPending}>
                {createAccount.isPending ? "Creating…" : "Create account"}
              </Button>
            </div>
          </form>
        </DialogSurface>
      ) : null}

      {configuring === undefined ? null : (
        <DialogSurface labelledBy="billing-cycle-title" onClose={() => setConfiguring(undefined)}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="billing-cycle-title" className="text-lg font-bold text-foreground">
                Billing cycle
              </h2>
              <p className="mt-1 text-sm text-foreground-muted">{configuring.name}</p>
            </div>
            <button
              type="button"
              aria-label="Close billing cycle"
              onClick={() => setConfiguring(undefined)}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-foreground-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              ✕
            </button>
          </div>
          <form className="mt-5 space-y-4" onSubmit={saveCardConfig}>
            <div className="grid grid-cols-2 gap-3">
              <Input
                id="edit-statement-day"
                label="Statement day"
                type="number"
                name="editStatementDay"
                inputMode="numeric"
                autoComplete="off"
                min={1}
                max={31}
                value={statementDay}
                onChange={(event) => setStatementDay(event.target.value)}
              />
              <Input
                id="edit-due-day"
                label="Due day"
                type="number"
                name="editDueDay"
                inputMode="numeric"
                autoComplete="off"
                min={1}
                max={31}
                value={dueDay}
                onChange={(event) => setDueDay(event.target.value)}
              />
            </div>
            <p className="text-xs leading-relaxed text-foreground-muted">
              This schedules future cycles. Existing generated bills are never recalculated.
            </p>
            {error === undefined ? null : (
              <p role="alert" className="text-sm text-expense">
                {error}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                className="w-full sm:w-auto"
                type="button"
                variant="secondary"
                onClick={() => setConfiguring(undefined)}
              >
                Cancel
              </Button>
              <Button
                className="w-full sm:w-auto"
                type="submit"
                disabled={updateCardConfig.isPending}
              >
                {updateCardConfig.isPending ? "Saving…" : "Save cycle"}
              </Button>
            </div>
          </form>
        </DialogSurface>
      )}

      {confirming === undefined ? null : (
        <DialogSurface labelledBy="archive-account-title" onClose={() => setConfirming(undefined)}>
          <h2 id="archive-account-title" className="text-lg font-bold text-foreground">
            Archive {confirming.name}?
          </h2>
          <p className="mt-2 text-sm text-foreground-muted">
            It drops out of active lists and totals, but its transaction history stays intact. This
            can&apos;t be undone — archiving is one-way.
          </p>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              className="w-full sm:w-auto"
              type="button"
              variant="secondary"
              onClick={() => setConfirming(undefined)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void archive()}
              disabled={archiveAccount.isPending}
              className="w-full bg-expense text-white hover:bg-expense/90 sm:w-auto"
            >
              {archiveAccount.isPending ? "Archiving…" : "Archive account"}
            </Button>
          </div>
        </DialogSurface>
      )}

      {detailAccount === undefined ? null : (
        <AccountDetailDialog account={detailAccount} onClose={() => setDetailAccount(undefined)} />
      )}
    </section>
  );
}
