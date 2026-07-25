import { z } from "zod";

import { AccountIdSchema } from "./account.js";

const PositiveMinorSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const SignedMinorSchema = z
  .number()
  .int()
  .min(Number.MIN_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER);
const GoalNameSchema = z.string().trim().min(1).max(80);
const GoalTagSchema = z.string().trim().min(1).max(40);

export const GoalIdSchema = z.string().uuid("Goal id must be a UUID.");
export const GoalFundingModeSchema = z.enum(["linked_account", "tagged"]);
export const GoalStatusSchema = z.enum(["active", "achieved", "abandoned"]);

const GoalCreateCommonShape = {
  name: GoalNameSchema,
  targetMinor: PositiveMinorSchema,
  targetDate: z.coerce.date().optional()
};

export const CreateGoalSchema = z.discriminatedUnion("fundingMode", [
  z
    .object({
      ...GoalCreateCommonShape,
      fundingMode: z.literal("linked_account"),
      linkedAccountId: AccountIdSchema
    })
    .strict(),
  z
    .object({
      ...GoalCreateCommonShape,
      fundingMode: z.literal("tagged"),
      tag: GoalTagSchema
    })
    .strict()
]);

/**
 * Funding mode and its linked account/tag are deliberately immutable. Changing
 * either would redefine historical progress; abandon and recreate the goal
 * instead.
 */
export const UpdateGoalSchema = z
  .object({
    name: GoalNameSchema.optional(),
    targetMinor: PositiveMinorSchema.optional(),
    targetDate: z.coerce.date().nullable().optional()
  })
  .strict()
  .refine(
    (value) =>
      value.name !== undefined || value.targetMinor !== undefined || value.targetDate !== undefined,
    { message: "At least one field must be provided." }
  );

export const ListGoalsQuerySchema = z.object({
  status: GoalStatusSchema.default("active")
});

export const ReorderGoalsSchema = z
  .object({ goalIds: z.array(GoalIdSchema).max(200) })
  .refine((value) => new Set(value.goalIds).size === value.goalIds.length, {
    message: "goalIds must not contain duplicates.",
    path: ["goalIds"]
  });

export const StoredGoalSchema = z.object({
  id: GoalIdSchema,
  userId: z.string().min(1),
  name: GoalNameSchema,
  targetMinor: PositiveMinorSchema,
  targetDate: z.coerce.date().optional(),
  fundingMode: GoalFundingModeSchema,
  linkedAccountId: AccountIdSchema.optional(),
  tag: GoalTagSchema.optional(),
  priority: z.number().int().min(0),
  status: GoalStatusSchema,
  startedMinor: SignedMinorSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
});

export const GoalSchema = StoredGoalSchema.extend({
  progressMinor: SignedMinorSchema
});

export const GoalPlanSchema = z.object({
  goalId: GoalIdSchema,
  mode: z.enum(["target_date", "at_current_rate"]),
  requiredMonthlyMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
  projectedCompletionDate: z.coerce.date().nullable()
});

export type GoalId = z.infer<typeof GoalIdSchema>;
export type GoalFundingMode = z.infer<typeof GoalFundingModeSchema>;
export type GoalStatus = z.infer<typeof GoalStatusSchema>;
export type CreateGoal = z.infer<typeof CreateGoalSchema>;
export type UpdateGoal = z.infer<typeof UpdateGoalSchema>;
export type ListGoalsQuery = z.infer<typeof ListGoalsQuerySchema>;
export type ReorderGoals = z.infer<typeof ReorderGoalsSchema>;
export type StoredGoal = z.infer<typeof StoredGoalSchema>;
export type Goal = z.infer<typeof GoalSchema>;
export type GoalPlan = z.infer<typeof GoalPlanSchema>;
