import { RecurringRuleSchema, type RecurringRule } from "@treasury-ops/shared";
import { cache } from "react";
import { z } from "zod";

import { getServerApiClient } from "@/lib/api/server";

const RecurringRulesSchema = z.array(RecurringRuleSchema);

export const getRecurringRules = cache(async (): Promise<RecurringRule[]> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/recurring");
    const parsed = RecurringRulesSchema.safeParse(result.data);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
});
