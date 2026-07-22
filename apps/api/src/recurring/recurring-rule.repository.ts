import { Inject, Injectable } from "@nestjs/common";
import {
  RecurringRuleSchema,
  type CreateRecurringRule,
  type RecurringRule,
  type RecurringRuleId,
  type UpdateRecurringRule
} from "@treasury-ops/shared";
import { and, asc, eq, lte } from "drizzle-orm";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { recurringRules } from "../common/db/schema/index.js";
import { stripNulls } from "../common/db/strip-nulls.js";
import type { DbTx } from "../common/db/db-txn.js";

@Injectable()
export class RecurringRuleRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async create(
    userId: string,
    input: CreateRecurringRule,
    nextRunAt: Date,
    tx: DbTx
  ): Promise<RecurringRule> {
    const now = new Date();
    const [row] = await tx
      .insert(recurringRules)
      .values({
        userId,
        templateAccountId: input.template.accountId,
        templateCategoryId: input.template.categoryId ?? null,
        templateType: input.template.type,
        templateAmountMinor: input.template.amountMinor,
        templateDescription: input.template.description,
        templateTags: input.template.tags,
        rrule: input.rrule,
        startAt: input.startAt,
        nextRunAt,
        isPaused: false,
        createdAt: now,
        updatedAt: now
      })
      .returning();
    if (row === undefined) throw new Error("Recurring rule insert did not return a row.");
    return toRecurringRule(row);
  }

  async list(userId: string): Promise<RecurringRule[]> {
    const rows = await this.db
      .select()
      .from(recurringRules)
      .where(eq(recurringRules.userId, userId))
      .orderBy(asc(recurringRules.createdAt));
    return rows.map(toRecurringRule);
  }

  async findById(
    userId: string,
    ruleId: RecurringRuleId,
    tx?: DbTx
  ): Promise<RecurringRule | null> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select()
      .from(recurringRules)
      .where(and(eq(recurringRules.id, ruleId), eq(recurringRules.userId, userId)));
    return row === undefined ? null : toRecurringRule(row);
  }

  /**
   * `nextRunAt === undefined` leaves the field untouched (a template/isPaused
   * -only patch); a Date reseeds it (the rrule changed). Every other field is
   * merged shallowly against the stored template, since
   * `RecurringRuleTemplatePatchSchema` already guarantees "omitted = no
   * change" at the zod layer (see recurring.ts for why `.partial()` couldn't
   * be trusted for this).
   */
  async update(
    userId: string,
    ruleId: RecurringRuleId,
    patch: UpdateRecurringRule,
    nextRunAt: Date | undefined,
    tx: DbTx
  ): Promise<RecurringRule | null> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.template?.accountId !== undefined) set.templateAccountId = patch.template.accountId;
    if (patch.template?.categoryId !== undefined) {
      set.templateCategoryId = patch.template.categoryId;
    }
    if (patch.template?.type !== undefined) set.templateType = patch.template.type;
    if (patch.template?.amountMinor !== undefined) {
      set.templateAmountMinor = patch.template.amountMinor;
    }
    if (patch.template?.description !== undefined) {
      set.templateDescription = patch.template.description;
    }
    if (patch.template?.tags !== undefined) set.templateTags = patch.template.tags;
    if (patch.rrule !== undefined) set.rrule = patch.rrule;
    if (patch.isPaused !== undefined) set.isPaused = patch.isPaused;
    if (nextRunAt !== undefined) set.nextRunAt = nextRunAt;

    const [row] = await tx
      .update(recurringRules)
      .set(set)
      .where(and(eq(recurringRules.id, ruleId), eq(recurringRules.userId, userId)))
      .returning();
    return row === undefined ? null : toRecurringRule(row);
  }

  /**
   * Global sweep query (all users) — the cron scans everyone's due rules in
   * one pass, mirroring NotificationOutboxRepository.findPending. `asOf` must
   * be the UTC-midnight representation of "today" per the IST-calendar-day
   * convention (see toISTCalendarDate/parseExplicitDate) — comparing against
   * a raw `Date.now()` instant would miss rules due earlier the same IST day,
   * since a stored nextRunAt of "UTC midnight of day D" is later in wall-clock
   * terms than 01:00 IST on day D.
   */
  async findDue(asOf: Date): Promise<RecurringRule[]> {
    const rows = await this.db
      .select()
      .from(recurringRules)
      .where(and(eq(recurringRules.isPaused, false), lte(recurringRules.nextRunAt, asOf)));
    return rows.map(toRecurringRule);
  }

  /**
   * Atomic idempotency check for the materializer: only succeeds if
   * `nextRunAt` still equals the value read by the sweep. A concurrent or
   * retried run that already advanced it fails this CAS and skips posting —
   * this *is* the "ruleId + scheduledDate" idempotency key from BACKEND.md
   * §6, expressed as a compare-and-swap instead of a separate unique index.
   *
   * `pause` folds the "COUNT/UNTIL exhausted" pause into this same CAS
   * (rather than a separate post-claim update) because on a rule's final
   * occurrence `newNextRunAt` equals `expectedNextRunAt` — there's no next
   * occurrence to advance to. Without `isPaused = false` also in the
   * predicate, a concurrent duplicate run's UPDATE would still match after
   * the winner commits (the row's `nextRunAt` never changed), claiming and
   * posting a second time. Setting `isPaused` in the same statement gives
   * the loser something that *did* change to fail against.
   */
  async claimRun(
    userId: string,
    ruleId: RecurringRuleId,
    expectedNextRunAt: Date,
    newNextRunAt: Date,
    pause: boolean,
    tx: DbTx
  ): Promise<boolean> {
    const rows = await tx
      .update(recurringRules)
      .set({
        nextRunAt: newNextRunAt,
        lastRunAt: expectedNextRunAt,
        isPaused: pause,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(recurringRules.id, ruleId),
          eq(recurringRules.userId, userId),
          eq(recurringRules.nextRunAt, expectedNextRunAt),
          eq(recurringRules.isPaused, false)
        )
      )
      .returning({ id: recurringRules.id });
    return rows.length === 1;
  }
}

function toRecurringRule(row: typeof recurringRules.$inferSelect): RecurringRule {
  const stripped = stripNulls(row);
  return RecurringRuleSchema.parse({
    id: row.id,
    userId: row.userId,
    template: {
      accountId: row.templateAccountId,
      categoryId: stripped.templateCategoryId,
      type: row.templateType,
      amountMinor: row.templateAmountMinor,
      description: row.templateDescription,
      tags: row.templateTags
    },
    rrule: row.rrule,
    startAt: row.startAt,
    nextRunAt: row.nextRunAt,
    lastRunAt: stripped.lastRunAt,
    isPaused: row.isPaused,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  });
}
