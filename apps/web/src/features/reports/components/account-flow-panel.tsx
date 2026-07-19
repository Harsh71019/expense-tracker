import type { Account, MonthlyRollup } from "@vyaya/shared";
import type { ReactNode } from "react";

import { SignedMoney } from "@/components/ui/money";

type AccountFlowPanelProps = Readonly<{
  rollup: MonthlyRollup;
  accounts: readonly Account[];
}>;

export function AccountFlowPanel({ rollup, accounts }: AccountFlowPanelProps): ReactNode {
  return (
    <div className="rounded-[18px] border border-border bg-surface-elevated p-5.5">
      <p className="text-base font-bold tracking-tight text-foreground">Net flow by account</p>
      <div className="mt-3.5 flex flex-col">
        {rollup.byAccount.map((entry) => {
          const account = accounts.find((item) => item.id === entry.accountId);
          return (
            <div
              key={entry.accountId}
              className="flex items-center gap-3 border-b border-border py-3 last:border-b-0"
            >
              <span className="text-sm font-medium text-foreground">
                {account?.name ?? "Unavailable account"}
              </span>
              <div className="flex-1" />
              <SignedMoney minor={entry.netMinor} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
