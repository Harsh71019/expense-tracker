import { z } from "zod";

import { GoalIdSchema } from "./goal.js";
import { PageInfoSchema } from "./pagination.js";

const NonNegativeMinorSchema = z
  .number()
  .int("Money must be an integer number of paise.")
  .min(0, "Money cannot be negative.")
  .max(Number.MAX_SAFE_INTEGER, "Money exceeds the supported paise range.");

const SignedMinorSchema = z
  .number()
  .int("Money must be an integer number of paise.")
  .min(Number.MIN_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER);

export const SafetyBufferModeSchema = z.enum([
  "fixed_amount",
  "essential_months",
  "emergency_fund_goal"
]);

export const SafetyBufferPreferenceIdSchema = z
  .string()
  .uuid("Safety buffer preference id must be a UUID.");

export const SafetyBufferPreferenceSchema = z.object({
  id: SafetyBufferPreferenceIdSchema,
  userId: z.string().min(1),
  version: z.number().int().positive(),
  mode: SafetyBufferModeSchema,
  amountMinor: NonNegativeMinorSchema.nullable(),
  months: z.number().int().min(1).max(36).nullable(),
  emergencyFundGoalId: GoalIdSchema.nullable(),
  effectiveFrom: z.coerce.date(),
  createdAt: z.coerce.date()
});

export const CreateSafetyBufferPreferenceSchema = z
  .object({
    mode: SafetyBufferModeSchema,
    amountMinor: NonNegativeMinorSchema.optional(),
    months: z.number().int().min(1).max(36).optional(),
    emergencyFundGoalId: GoalIdSchema.optional(),
    effectiveFrom: z.coerce.date().optional()
  })
  .superRefine((data, ctx) => {
    if (
      data.mode === "fixed_amount" &&
      (data.amountMinor === undefined || data.amountMinor === null)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "amountMinor is required when mode is fixed_amount.",
        path: ["amountMinor"]
      });
    }
    if (data.mode === "essential_months" && (data.months === undefined || data.months === null)) {
      ctx.addIssue({
        code: "custom",
        message: "months is required when mode is essential_months.",
        path: ["months"]
      });
    }
    if (
      data.mode === "emergency_fund_goal" &&
      (data.emergencyFundGoalId === undefined || data.emergencyFundGoalId === null)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "emergencyFundGoalId is required when mode is emergency_fund_goal.",
        path: ["emergencyFundGoalId"]
      });
    }
  });

export const SafetyBufferStateSchema = z.object({
  preference: SafetyBufferPreferenceSchema.nullable(),
  isFallback: z.boolean(),
  fallbackPolicy: z.string().nullable(),
  targetMinor: NonNegativeMinorSchema,
  liquidBalanceMinor: SignedMinorSchema,
  bufferGapMinor: NonNegativeMinorSchema,
  bufferSurplusMinor: NonNegativeMinorSchema,
  monthlyEssentialOutflowMinor: NonNegativeMinorSchema
});

export const SafetyBufferVersionPageSchema = z.object({
  items: z.array(SafetyBufferPreferenceSchema),
  pageInfo: PageInfoSchema
});

export type SafetyBufferMode = z.infer<typeof SafetyBufferModeSchema>;
export type SafetyBufferPreference = z.infer<typeof SafetyBufferPreferenceSchema>;
export type CreateSafetyBufferPreference = z.infer<typeof CreateSafetyBufferPreferenceSchema>;
export type SafetyBufferState = z.infer<typeof SafetyBufferStateSchema>;
export type SafetyBufferVersionPage = z.infer<typeof SafetyBufferVersionPageSchema>;
