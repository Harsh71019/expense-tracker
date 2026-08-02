import type { ReactNode } from "react";

import { getAccounts } from "@/features/accounts/server/get-accounts";
import { getCategories } from "@/features/categories/server/get-categories";
import {
  getRecurringReconciliations,
  getRecurringRules,
  RecurringManager
} from "@/features/recurring";

export default async function RecurringPage(): Promise<ReactNode> {
  const [initialRules, accounts, categories, initialReconciliations] = await Promise.all([
    getRecurringRules(),
    getAccounts(),
    getCategories(),
    getRecurringReconciliations()
  ]);
  return (
    <RecurringManager
      initialRules={initialRules}
      accounts={accounts}
      categories={categories}
      initialReconciliations={initialReconciliations}
    />
  );
}
