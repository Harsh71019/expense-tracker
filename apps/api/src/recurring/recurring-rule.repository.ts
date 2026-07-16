import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import {
  RecurringRuleSchema,
  type CreateRecurringRule,
  type RecurringRule,
  type RecurringRuleId,
  type UpdateRecurringRule
} from "@vyaya/shared";
import { Types } from "mongoose";
import type { Connection } from "mongoose";

import type { MongoSession } from "../common/mongo-txn.js";

const RECURRING_RULES_COLLECTION = "recurring_rules";

@Injectable()
export class RecurringRuleRepository {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async create(
    userId: string,
    input: CreateRecurringRule,
    nextRunAt: Date,
    session: MongoSession
  ): Promise<RecurringRule> {
    const now = new Date();
    const category =
      input.template.categoryId === undefined
        ? {}
        : { categoryId: new Types.ObjectId(input.template.categoryId) };
    const document = {
      userId,
      template: {
        accountId: new Types.ObjectId(input.template.accountId),
        ...category,
        type: input.template.type,
        amountMinor: input.template.amountMinor,
        description: input.template.description,
        tags: input.template.tags
      },
      rrule: input.rrule,
      startAt: input.startAt,
      nextRunAt,
      isPaused: false,
      createdAt: now,
      updatedAt: now
    };
    const result = await this.database()
      .collection(RECURRING_RULES_COLLECTION)
      .insertOne(document, { session });
    return this.toRecurringRule({ _id: result.insertedId, ...document });
  }

  async list(userId: string): Promise<RecurringRule[]> {
    const rules = await this.database()
      .collection(RECURRING_RULES_COLLECTION)
      .find({ userId })
      .sort({ createdAt: 1 })
      .toArray();
    return rules.map((rule) => this.toRecurringRule(rule));
  }

  async findById(
    userId: string,
    ruleId: RecurringRuleId,
    session?: MongoSession
  ): Promise<RecurringRule | null> {
    const rule = await this.database()
      .collection(RECURRING_RULES_COLLECTION)
      .findOne(
        { _id: new Types.ObjectId(ruleId), userId },
        session === undefined ? {} : { session }
      );
    return rule === null ? null : this.toRecurringRule(rule);
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
    session: MongoSession
  ): Promise<RecurringRule | null> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.template?.accountId !== undefined) {
      set["template.accountId"] = new Types.ObjectId(patch.template.accountId);
    }
    if (patch.template?.categoryId !== undefined) {
      set["template.categoryId"] = new Types.ObjectId(patch.template.categoryId);
    }
    if (patch.template?.type !== undefined) set["template.type"] = patch.template.type;
    if (patch.template?.amountMinor !== undefined) {
      set["template.amountMinor"] = patch.template.amountMinor;
    }
    if (patch.template?.description !== undefined) {
      set["template.description"] = patch.template.description;
    }
    if (patch.template?.tags !== undefined) set["template.tags"] = patch.template.tags;
    if (patch.rrule !== undefined) set.rrule = patch.rrule;
    if (patch.isPaused !== undefined) set.isPaused = patch.isPaused;
    if (nextRunAt !== undefined) set.nextRunAt = nextRunAt;

    const result = await this.database()
      .collection(RECURRING_RULES_COLLECTION)
      .findOneAndUpdate(
        { _id: new Types.ObjectId(ruleId), userId },
        { $set: set },
        { session, returnDocument: "after" }
      );
    return result === null ? null : this.toRecurringRule(result);
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
    const rules = await this.database()
      .collection(RECURRING_RULES_COLLECTION)
      .find({ isPaused: false, nextRunAt: { $lte: asOf } })
      .toArray();
    return rules.map((rule) => this.toRecurringRule(rule));
  }

  /**
   * Atomic idempotency check for the materializer: only succeeds if
   * `nextRunAt` still equals the value read by the sweep. A concurrent or
   * retried run that already advanced it fails this CAS and skips posting —
   * this *is* the "ruleId + scheduledDate" idempotency key from BACKEND.md
   * §6, expressed as a compare-and-swap instead of a separate unique index.
   */
  async claimRun(
    userId: string,
    ruleId: RecurringRuleId,
    expectedNextRunAt: Date,
    newNextRunAt: Date,
    session: MongoSession
  ): Promise<boolean> {
    const result = await this.database()
      .collection(RECURRING_RULES_COLLECTION)
      .updateOne(
        { _id: new Types.ObjectId(ruleId), userId, nextRunAt: expectedNextRunAt },
        {
          $set: { nextRunAt: newNextRunAt, lastRunAt: expectedNextRunAt, updatedAt: new Date() }
        },
        { session }
      );
    return result.modifiedCount === 1;
  }

  /**
   * Used by the materializer when a rule's rrule has no further occurrence
   * (COUNT/UNTIL exhausted) after the one just posted — pausing removes it
   * from findDue's future scans instead of leaving nextRunAt stuck at an
   * already-due date, which would make every subsequent sweep re-claim and
   * fail forever.
   */
  async pause(userId: string, ruleId: RecurringRuleId, session: MongoSession): Promise<void> {
    await this.database()
      .collection(RECURRING_RULES_COLLECTION)
      .updateOne(
        { _id: new Types.ObjectId(ruleId), userId },
        { $set: { isPaused: true, updatedAt: new Date() } },
        { session }
      );
  }

  private toRecurringRule(value: Record<string, unknown>): RecurringRule {
    const { _id, template, ...rest } = value;
    return RecurringRuleSchema.parse({
      id: objectIdString(_id),
      template: toTemplate(template),
      ...rest
    });
  }

  private database(): NonNullable<Connection["db"]> {
    const database = this.connection.db;
    if (database === undefined) {
      throw new Error("MongoDB connection is not ready");
    }
    return database;
  }
}

function toTemplate(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error("Recurring rule document is missing its template.");
  }
  const { accountId, categoryId, ...rest } = value;
  const category = categoryId === undefined ? {} : { categoryId: objectIdString(categoryId) };
  return { accountId: objectIdString(accountId), ...category, ...rest };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function objectIdString(value: unknown): string {
  if (typeof value !== "object" || value === null || !("toString" in value)) {
    throw new Error("MongoDB document contains an invalid ObjectId.");
  }
  const stringify = value.toString;
  if (typeof stringify !== "function") {
    throw new Error("MongoDB document contains an invalid ObjectId.");
  }
  return stringify.call(value);
}
