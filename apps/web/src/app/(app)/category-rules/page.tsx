import type { ReactNode } from "react";

import { CategoryRuleManager } from "@/features/category-rules";
import { getCategoryRules } from "@/features/category-rules/server/get-category-rules";

export default async function CategoryRulesPage(): Promise<ReactNode> {
  return <CategoryRuleManager initialRules={await getCategoryRules()} />;
}
