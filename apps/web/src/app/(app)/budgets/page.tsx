import type { ReactNode } from "react";

import { BudgetsPage } from "@/features/budgets";
import { getBudgetPage } from "@/features/budgets/server/get-budgets";
import { getCategories } from "@/features/categories/server/get-categories";

export default async function BudgetsRoute(): Promise<ReactNode> {
  const [initialPage, categories] = await Promise.all([getBudgetPage(), getCategories()]);
  return <BudgetsPage initialPage={initialPage} categories={categories} />;
}
