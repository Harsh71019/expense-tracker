import type { ReactNode } from "react";

import { getAccounts } from "@/features/accounts/server/get-accounts";
import { getCategories } from "@/features/categories/server/get-categories";
import { getRecurringRules, RecurringManager } from "@/features/recurring";

export default async function RecurringPage(): Promise<ReactNode> {
  const [initialRules, accounts, categories] = await Promise.all([
    getRecurringRules(),
    getAccounts(),
    getCategories()
  ]);
  return (
    <RecurringManager initialRules={initialRules} accounts={accounts} categories={categories} />
  );
}
