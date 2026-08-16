import type { ReactNode } from "react";

import { getAccounts } from "@/features/accounts/server/get-accounts";
import { getCategories } from "@/features/categories/server/get-categories";
import {
  getRecurringReconciliations,
  getDetectedStreams,
  getRecurringRules,
  getRecurringStats,
  RecurringManager
} from "@/features/recurring";

export default async function RecurringPage(): Promise<ReactNode> {
  const [
    initialRules,
    accounts,
    categories,
    initialReconciliations,
    initialStats,
    initialDetectedStreams
  ] = await Promise.all([
    getRecurringRules(),
    getAccounts(),
    getCategories(),
    getRecurringReconciliations(),
    getRecurringStats(),
    getDetectedStreams()
  ]);
  return (
    <RecurringManager
      initialRules={initialRules}
      accounts={accounts}
      categories={categories}
      initialReconciliations={initialReconciliations}
      initialStats={initialStats}
      initialDetectedStreams={initialDetectedStreams}
    />
  );
}
