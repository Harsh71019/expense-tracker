import type { ReactNode } from "react";

import { getAssets } from "@/features/assets/server/get-assets";
import { ProtectionDebtPanel } from "@/features/financial-profile";
import {
  DEBT_PAGE_SIZE,
  getDeclaredDebtPage,
  getProtectionState
} from "@/features/financial-profile/server/get-protection-profile";

export async function ProtectionSection(): Promise<ReactNode> {
  const [protection, debts, assets] = await Promise.all([
    getProtectionState(),
    getDeclaredDebtPage(DEBT_PAGE_SIZE),
    getAssets()
  ]);

  return (
    <ProtectionDebtPanel
      initialProtection={protection}
      initialDebts={debts}
      initialAssets={assets}
      debtPageSize={DEBT_PAGE_SIZE}
    />
  );
}
