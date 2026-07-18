import * as rrulePkg from "rrule";
import { z } from "zod";

import { AccountIdSchema } from "./account.js";
import { CategoryIdSchema } from "./category.js";
import { TransactionTypeSchema } from "./transaction.js";

type RRuleConstructor = typeof import("rrule").RRule;

/**
 * rrule ships no `exports` map — just `main` (a UMD bundle) and `module`
 * (real ESM). Node's native ESM resolver ignores `module` and falls back to
 * `main`, but that UMD wrapper isn't statically analyzable by
 * cjs-module-lexer, so the namespace import's named `RRule` binding is
 * missing there — while bundlers (Turbopack/webpack, used by apps/web)
 * resolve the same bare specifier via `module` to the real-ESM build
 * instead, where the named binding *is* present directly. The two consumers
 * of this package (apps/api under plain Node, apps/web under Turbopack) hit
 * genuinely different files with incompatible export shapes, so this can't
 * be fixed by picking a different `import` form — it has to duck-type at
 * runtime. This deliberately avoids Node builtins (no `createRequire`):
 * `packages/shared` has no `sideEffects: false`, so this module can end up
 * in a browser bundle via the barrel export even if only a server component
 * uses it today, and `node:module` doesn't exist there.
 */
const RRule = resolveRRuleConstructor();

function resolveRRuleConstructor(): RRuleConstructor {
  const namespace: unknown = rrulePkg;
  const direct = isRecord(namespace) ? namespace.RRule : undefined;
  if (isRRuleConstructor(direct)) return direct;

  const cjsDefault = isRecord(namespace) ? namespace.default : undefined;
  const viaDefault = isRecord(cjsDefault) ? cjsDefault.RRule : undefined;
  if (isRRuleConstructor(viaDefault)) return viaDefault;

  throw new Error('Could not resolve the RRule constructor from the "rrule" package.');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRRuleConstructor(value: unknown): value is RRuleConstructor {
  return typeof value === "function";
}

export const RecurringRuleIdSchema = z.string().uuid("Recurring rule id must be a UUID.");

export const RecurringRuleTemplateSchema = z.object({
  accountId: AccountIdSchema,
  categoryId: CategoryIdSchema.optional(),
  type: TransactionTypeSchema,
  amountMinor: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  description: z.string().trim().min(1).max(500),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([])
});

/**
 * RFC 5545 RRULE value (e.g. "FREQ=MONTHLY;BYMONTHDAY=1"), validated via the
 * rrule lib rather than a hand-rolled regex — FREQ/BYMONTHDAY/etc combinations
 * are too combinatorial to validate any other way. DTSTART is rejected here
 * because dtstart is owned separately by `startAt`: embedding one in the
 * RRULE string would silently be discarded wherever this module computes
 * occurrences (dtstart is always supplied by the caller), which would be a
 * confusing trap for API consumers who assumed it took effect.
 */
export const RRuleStringSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !/DTSTART/i.test(value), {
    message: "RRULE must not embed DTSTART — pass the anchor date via startAt instead."
  })
  .refine(isParseableRRule, {
    message: "Must be a valid RFC 5545 RRULE value (e.g. FREQ=MONTHLY;BYMONTHDAY=1)."
  });

export const CreateRecurringRuleSchema = z.object({
  template: RecurringRuleTemplateSchema,
  rrule: RRuleStringSchema,
  startAt: z.coerce.date()
});

/**
 * Hand-written rather than `RecurringRuleTemplateSchema.partial()`: zod still
 * applies a field's `.default()` when the key is omitted from partial input
 * (verified empirically), so a `.partial()` derivation would silently reset
 * `tags` to `[]` on every patch that doesn't touch it. Mirrors how
 * `UpdateTransactionSchema` is hand-written rather than derived from
 * `CreateTransactionSchema` for the same reason.
 */
const RecurringRuleTemplatePatchSchema = z.object({
  accountId: AccountIdSchema.optional(),
  categoryId: CategoryIdSchema.optional(),
  type: TransactionTypeSchema.optional(),
  amountMinor: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional(),
  description: z.string().trim().min(1).max(500).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional()
});

export const UpdateRecurringRuleSchema = z
  .object({
    template: RecurringRuleTemplatePatchSchema.optional(),
    rrule: RRuleStringSchema.optional(),
    isPaused: z.boolean().optional()
  })
  .refine(
    (value) =>
      value.template !== undefined || value.rrule !== undefined || value.isPaused !== undefined,
    { message: "At least one field must be provided." }
  );

export const RecurringRuleSchema = z.object({
  id: RecurringRuleIdSchema,
  userId: z.string().min(1),
  template: RecurringRuleTemplateSchema,
  rrule: RRuleStringSchema,
  startAt: z.coerce.date(),
  nextRunAt: z.coerce.date(),
  lastRunAt: z.coerce.date().optional(),
  isPaused: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
});

export type RecurringRuleId = z.infer<typeof RecurringRuleIdSchema>;
export type RecurringRuleTemplate = z.infer<typeof RecurringRuleTemplateSchema>;
export type CreateRecurringRule = z.infer<typeof CreateRecurringRuleSchema>;
export type UpdateRecurringRule = z.infer<typeof UpdateRecurringRuleSchema>;
export type RecurringRule = z.infer<typeof RecurringRuleSchema>;

function isParseableRRule(value: string): boolean {
  try {
    RRule.fromString(value);
    return true;
  } catch {
    return false;
  }
}

function toRRule(rrule: string, dtstart: Date): InstanceType<typeof RRule> {
  return new RRule({ ...RRule.parseString(rrule), dtstart });
}

/**
 * The occurrence at or after `startAt` — used at rule-creation time to seed
 * `nextRunAt`. Returns null for a well-formed but unsatisfiable rule (e.g. an
 * UNTIL before startAt, or COUNT already exhausted), which the caller should
 * treat as a validation error rather than silently creating a rule that will
 * never fire.
 */
export function computeFirstOccurrence(rrule: string, startAt: Date): Date | null {
  return toRRule(rrule, startAt).after(new Date(startAt.getTime() - 1), true);
}

/**
 * The occurrence strictly after `after`, anchored to the rule's original
 * `startAt` (dtstart affects phase for weekly/day-of-week rules even once
 * BYMONTHDAY/BYDAY narrows it). Used both to advance `nextRunAt` post-posting
 * and to reseed it when a rule's RRULE is edited.
 */
export function computeNextOccurrence(rrule: string, startAt: Date, after: Date): Date | null {
  return toRRule(rrule, startAt).after(after, false);
}
