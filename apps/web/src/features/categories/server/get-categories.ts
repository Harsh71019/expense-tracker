import { CategorySchema, type Category } from "@treasury-ops/shared";
import { cache } from "react";
import { z } from "zod";

import { getServerApiClient } from "@/lib/api/server";

const CategoriesSchema = z.array(CategorySchema);

const getCategoriesCached = cache(async (includeArchived: boolean): Promise<Category[]> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/categories", {
      params: { query: { includeArchived: includeArchived ? "true" : "false" } }
    });
    const parsed = CategoriesSchema.safeParse(result.data);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
});

export function getCategories(includeArchived = false): Promise<Category[]> {
  return getCategoriesCached(includeArchived);
}
