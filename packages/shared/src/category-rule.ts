import { z } from "zod";

import { CategoryIdSchema } from "./category.js";
import { migratingIdSchema } from "./id.js";

export const CategoryRuleIdSchema = migratingIdSchema();

export const CreateCategoryRuleSchema = z.object({
  /** Case-insensitive substring matched against a transaction description. */
  pattern: z.string().trim().min(1).max(80),
  categoryId: CategoryIdSchema
});

export const CategoryRuleSchema = CreateCategoryRuleSchema.extend({
  id: CategoryRuleIdSchema,
  userId: z.string().min(1),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
});

export type CategoryRuleId = z.infer<typeof CategoryRuleIdSchema>;
export type CreateCategoryRule = z.infer<typeof CreateCategoryRuleSchema>;
export type CategoryRule = z.infer<typeof CategoryRuleSchema>;
