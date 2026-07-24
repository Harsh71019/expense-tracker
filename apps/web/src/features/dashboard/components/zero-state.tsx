import type { AccountType } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { ACCOUNT_TYPE_META } from "./create-account-modal";

const STARTER_KINDS: readonly AccountType[] = ["bank", "credit_card", "cash", "investment"];

type ZeroStateProps = Readonly<{
  onOpenCreate: (type: AccountType) => void;
}>;

export function ZeroState({ onOpenCreate }: ZeroStateProps): ReactNode {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-surface-elevated p-10 text-center sm:p-16">
      <span
        className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-64 w-64 rounded-full bg-accent-glow blur-3xl"
        aria-hidden="true"
      />
      <div className="relative">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-accent font-mono text-3xl font-bold text-accent-foreground shadow-glow-strong">
          ₹
        </div>
        <h2 className="mt-5 text-2xl font-bold tracking-tight text-foreground">
          Let&apos;s set up your first account
        </h2>
        <p className="mx-auto mt-2.5 max-w-md text-sm text-foreground-muted">
          An account is where your money lives — a bank, a card, cash, a wallet. Every transaction
          you add lands in one. Create your first to get going.
        </p>
        <div className="mx-auto mt-6 flex max-w-[300px] flex-col gap-2.5">
          {STARTER_KINDS.map((value) => {
            const meta = ACCOUNT_TYPE_META.find((entry) => entry.value === value);
            if (meta === undefined) return null;
            return (
              <button
                key={value}
                type="button"
                onClick={() => onOpenCreate(value)}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3.5 text-left transition-colors duration-150 hover:border-accent/50"
              >
                <span className="text-lg leading-none">{meta.icon}</span>
                <span className="text-sm font-semibold text-foreground">
                  {value === "investment" ? "Investment" : meta.label}
                </span>
                <span className="flex-1" aria-hidden="true" />
                <span className="font-mono text-sm text-accent" aria-hidden="true">
                  →
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
