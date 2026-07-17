import { z } from "zod";

export const CategoryKindSchema = z.enum(["expense", "income"]);
export const CategoryIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Category id must be a MongoDB ObjectId.");

export const CreateCategorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: CategoryKindSchema,
  parentId: CategoryIdSchema.optional(),
  icon: z.string().trim().min(1).max(32).optional(),
  color: z
    .string()
    .trim()
    .regex(/^#[a-f\d]{6}$/i)
    .optional()
});

export const CategorySchema = CreateCategorySchema.extend({
  id: CategoryIdSchema,
  userId: z.string().min(1),
  isArchived: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
});

export type Category = z.infer<typeof CategorySchema>;
export type CategoryId = z.infer<typeof CategoryIdSchema>;
export type CategoryKind = z.infer<typeof CategoryKindSchema>;
export type CreateCategory = z.infer<typeof CreateCategorySchema>;
