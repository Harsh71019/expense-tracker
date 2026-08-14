import type { ReactNode } from "react";

import { CategoryManager } from "@/features/categories";
import { getCategories } from "@/features/categories/server/get-categories";
import { getMonthlyRollup } from "@/features/reports/server/get-monthly-rollup";
import { currentMonthInIndia } from "@/features/reports/model/month";
import { getBudgetPage } from "@/features/budgets/server/get-budgets";

export default async function CategoriesPage(): Promise<ReactNode> {
  const currentMonth = currentMonthInIndia();
  const [categories, monthlyRollup, budgetPage] = await Promise.all([
    getCategories(true),
    getMonthlyRollup(currentMonth),
    getBudgetPage(false, 100)
  ]);

  return (
    <CategoryManager
      initialCategories={categories}
      monthlyRollup={monthlyRollup}
      budgets={budgetPage?.items ?? []}
      currentMonth={currentMonth}
    />
  );
}
