import { Injectable } from "@nestjs/common";
import {
  DetectedStreamReviewSchema,
  RecurringRuleSchema,
  type AcceptDetectedStream,
  type DetectedStreamPage,
  type DetectedStreamReview,
  type ListDetectedStreamsQuery,
  type RecurringRule
} from "@treasury-ops/shared";

import { AuditRepository } from "../audit/audit.repository.js";
import {
  IdempotencyPostgresService,
  type IdempotentResult
} from "../common/idempotency/idempotency-postgres.service.js";
import { DetectedStreamNotReviewableError } from "../common/errors/detected-stream-not-reviewable.error.js";
import { RecurringRuleService } from "../recurring/recurring-rule.service.js";
import { RecurringDetectionRepository } from "./recurring-detection.repository.js";

@Injectable()
export class RecurringDetectionReviewService {
  constructor(
    private readonly streams: RecurringDetectionRepository,
    private readonly rules: RecurringRuleService,
    private readonly idempotency: IdempotencyPostgresService,
    private readonly audit: AuditRepository
  ) {}

  list(userId: string, query: ListDetectedStreamsQuery): Promise<DetectedStreamPage> {
    return this.streams.listForReview(userId, query);
  }

  accept(
    userId: string,
    streamId: string,
    input: AcceptDetectedStream,
    key: string
  ): Promise<IdempotentResult<RecurringRule>> {
    return this.idempotency.execute(
      userId,
      "recurring-detected.accept",
      key,
      { streamId, input },
      RecurringRuleSchema,
      async (tx) => {
        const stream = await this.streams.findForReview(userId, streamId, tx);
        if (
          stream === null ||
          stream.state === "stale" ||
          stream.sufficiency.status !== "sufficient"
        ) {
          throw new DetectedStreamNotReviewableError();
        }
        const createInput = {
          template: {
            accountId: input.accountId,
            type: stream.transactionType,
            amountMinor: stream.medianAmountMinor,
            description: "Detected recurring stream",
            tags: []
          },
          rrule: toRrule(stream.cadence),
          startAt: toIstStart(stream.nextExpectedDate, stream.computedAt),
          autoPost: input.autoPost
        };
        const equivalent = await this.rules.findEquivalentInTxn(userId, createInput, tx);
        const rule = equivalent ?? (await this.rules.createInTxn(userId, createInput, tx));
        const review = await this.streams.recordReview(
          userId,
          DetectedStreamReviewSchema.parse({
            streamId: stream.id,
            detectorVersion: stream.detectorVersion,
            decision: "accepted",
            recurringRuleId: rule.id,
            decidedAt: new Date()
          }),
          tx
        );
        await this.audit.record(
          userId,
          "recurring.detected_stream.accepted",
          stream.id,
          tx,
          safeAuditMeta(review)
        );
        return rule;
      }
    );
  }

  reject(
    userId: string,
    streamId: string,
    key: string
  ): Promise<IdempotentResult<DetectedStreamReview>> {
    return this.idempotency.execute(
      userId,
      "recurring-detected.reject",
      key,
      { streamId },
      DetectedStreamReviewSchema,
      async (tx) => {
        const stream = await this.streams.findForReview(userId, streamId, tx);
        if (stream === null) throw new DetectedStreamNotReviewableError();
        const review = await this.streams.recordReview(
          userId,
          DetectedStreamReviewSchema.parse({
            streamId: stream.id,
            detectorVersion: stream.detectorVersion,
            decision: "rejected",
            recurringRuleId: null,
            decidedAt: new Date()
          }),
          tx
        );
        await this.audit.record(
          userId,
          "recurring.detected_stream.rejected",
          stream.id,
          tx,
          safeAuditMeta(review)
        );
        return review;
      }
    );
  }
}

function toRrule(
  cadence: "weekly" | "biweekly" | "semimonthly" | "monthly" | "quarterly" | "annual"
): string {
  if (cadence === "weekly") return "FREQ=WEEKLY";
  if (cadence === "biweekly") return "FREQ=WEEKLY;INTERVAL=2";
  if (cadence === "semimonthly") return "FREQ=MONTHLY;INTERVAL=1";
  if (cadence === "monthly") return "FREQ=MONTHLY";
  if (cadence === "quarterly") return "FREQ=MONTHLY;INTERVAL=3";
  return "FREQ=YEARLY";
}

function toIstStart(nextExpectedDate: string | null, computedAt: Date): Date {
  if (nextExpectedDate === null) return computedAt;
  return new Date(`${nextExpectedDate}T00:00:00.000+05:30`);
}

function safeAuditMeta(review: DetectedStreamReview): Record<string, unknown> {
  return {
    detectorVersion: review.detectorVersion,
    decision: review.decision,
    recurringRuleId: review.recurringRuleId
  };
}
