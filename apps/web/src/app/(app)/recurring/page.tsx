import type { ReactNode } from "react";

import { getAccounts } from "@/features/accounts/server/get-accounts";
import { getCategories } from "@/features/categories/server/get-categories";
import {
  getRecurringReconciliations,
  getRecurringRules,
  getRecurringStats,
  RecurringManager
} from "@/features/recurring";

export default async function RecurringPage(): Promise<ReactNode> {
  const [initialRules, accounts, categories, initialReconciliations, initialStats] =
    await Promise.all([
      getRecurringRules(),
      getAccounts(),
      getCategories(),
      getRecurringReconciliations(),
      getRecurringStats()
    ]);
  return (
    <RecurringManager
      initialRules={initialRules}
      accounts={accounts}
      categories={categories}
      initialReconciliations={initialReconciliations}
      initialStats={initialStats}
    />
  );
}
