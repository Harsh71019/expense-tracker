import { CreateCategoryRuleSchema, type CreateCategoryRule } from "@treasury-ops/shared";
import type { z } from "zod";

export function parseCreateCategoryRuleInput(fields: {
  pattern: string;
  categoryId: string;
}): z.ZodSafeParseResult<CreateCategoryRule> {
  return CreateCategoryRuleSchema.safeParse(fields);
}
