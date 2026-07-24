import { z } from "zod";

export const CategoryKindSchema = z.enum(["expense", "income"]);
export const CategoryGroupSchema = z.enum(["essential", "lifestyle"]);
export const CategoryIdSchema = z.string().uuid("Category id must be a UUID.");

export const CreateCategorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: CategoryKindSchema,
  parentId: CategoryIdSchema.optional(),
  icon: z.string().trim().min(1).max(32).optional(),
  color: z
    .string()
    .trim()
    .regex(/^#[a-f\d]{6}$/i)
    .optional(),
  group: CategoryGroupSchema.optional()
});

export const CategorySchema = CreateCategorySchema.extend({
  id: CategoryIdSchema,
  userId: z.string().min(1),
  isArchived: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
});

export const UpdateCategoryGroupSchema = z.object({
  group: CategoryGroupSchema.nullable()
});

export type Category = z.infer<typeof CategorySchema>;
export type CategoryId = z.infer<typeof CategoryIdSchema>;
export type CategoryKind = z.infer<typeof CategoryKindSchema>;
export type CategoryGroup = z.infer<typeof CategoryGroupSchema>;
export type CreateCategory = z.infer<typeof CreateCategorySchema>;
export type UpdateCategoryGroup = z.infer<typeof UpdateCategoryGroupSchema>;
