import type { ReactNode } from "react";

import { CategoryManager } from "@/features/categories";
import { getCategories } from "@/features/categories/server/get-categories";

export default async function CategoriesPage(): Promise<ReactNode> {
  return <CategoryManager initialCategories={await getCategories()} />;
}
