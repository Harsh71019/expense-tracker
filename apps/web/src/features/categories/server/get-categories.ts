import { CategorySchema, type Category } from "@vyaya/shared";
import { cache } from "react";
import { z } from "zod";

import { getServerApiClient } from "@/lib/api/server";

const CategoriesSchema = z.array(CategorySchema);

export const getCategories = cache(async (): Promise<Category[]> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/categories");
    const parsed = CategoriesSchema.safeParse(result.data);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
});
