import { CategoryRuleSchema, type CategoryRule } from "@vyaya/shared";
import { cache } from "react";
import { z } from "zod";

import { getServerApiClient } from "@/lib/api/server";

const RulesSchema = z.array(CategoryRuleSchema);

export const getCategoryRules = cache(async (): Promise<CategoryRule[]> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/category-rules");
    const parsed = RulesSchema.safeParse(result.data);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
});
