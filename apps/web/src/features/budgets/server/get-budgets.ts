import { BudgetPageSchema, type BudgetPage } from "@treasury-ops/shared";
import { cache } from "react";

import { getServerApiClient } from "@/lib/api/server";

export const getBudgetPage = cache(
  async (includeArchived = false, limit = 50, cursor?: string): Promise<BudgetPage | null> => {
    try {
      const client = await getServerApiClient();
      const result = await client.GET("/v1/budgets", {
        params: {
          query: {
            includeArchived: includeArchived ? "true" : "false",
            limit,
            ...(cursor === undefined ? {} : { cursor })
          }
        }
      });
      const parsed = BudgetPageSchema.safeParse(result.data);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }
);
