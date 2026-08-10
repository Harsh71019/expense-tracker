import { Injectable } from "@nestjs/common";
import {
  RecurringOccurrenceSchema,
  type LinkRecurringOccurrencePayment,
  type ListRecurringOccurrencesQuery,
  type RecurringOccurrence,
  type RecurringOccurrenceId,
  type RecurringOccurrencePage,
  type RecurringRuleId
} from "@treasury-ops/shared";

import { AuditRepository } from "../audit/audit.repository.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { InvalidRecurringOccurrenceSourceError } from "../common/errors/invalid-recurring-occurrence-source.error.js";
import { RecurringOccurrenceAlreadyConfirmedError } from "../common/errors/recurring-occurrence-already-confirmed.error.js";
import {
  IdempotencyPostgresService,
  type IdempotentResult
} from "../common/idempotency/idempotency-postgres.service.js";
import { TransactionRepository } from "../transactions/transaction.repository.js";
import { RecurringOccurrenceRepository } from "./recurring-occurrence.repository.js";
import { RecurringRuleRepository } from "./recurring-rule.repository.js";

const OUTSTANDING_LIMIT = 200;

@Injectable()
export class RecurringOccurrenceService {
  constructor(
    private readonly occurrences: RecurringOccurrenceRepository,
    private readonly rules: RecurringRuleRepository,
    private readonly transactions: TransactionRepository,
    private readonly audit: AuditRepository,
    private readonly idempotency: IdempotencyPostgresService
  ) {}

  async list(
    userId: string,
    ruleId: RecurringRuleId,
    query: ListRecurringOccurrencesQuery
  ): Promise<RecurringOccurrencePage> {
    const rule = await this.rules.findById(userId, ruleId);
    if (rule === null) throw new EntityNotFoundError("Recurring rule");
    return this.occurrences.findMany(userId, ruleId, query);
  }

  listOutstanding(userId: string): Promise<RecurringOccurrence[]> {
    return this.occurrences.findOutstandingForUser(userId, OUTSTANDING_LIMIT);
  }

  linkPayment(
    userId: string,
    ruleId: RecurringRuleId,
    occurrenceId: RecurringOccurrenceId,
    input: LinkRecurringOccurrencePayment,
    key: string
  ): Promise<IdempotentResult<RecurringOccurrence>> {
    return this.idempotency.execute(
      userId,
      "recurring.occurrence.link-payment",
      key,
      { ruleId, occurrenceId, input },
      RecurringOccurrenceSchema,
      async (tx) => {
        const rule = await this.rules.findById(userId, ruleId, tx);
        if (rule === null) throw new EntityNotFoundError("Recurring rule");
        const occurrence = await this.occurrences.findByIdForUpdate(userId, occurrenceId, tx);
        if (occurrence === null || occurrence.recurringRuleId !== ruleId) {
          throw new EntityNotFoundError("Recurring occurrence");
        }
        if (occurrence.status !== "expected" && occurrence.status !== "missed") {
          throw new RecurringOccurrenceAlreadyConfirmedError();
        }

        const source = await this.transactions.findById(userId, input.transactionId, tx);
        if (
          source === null ||
          source.status !== "posted" ||
          source.recurringRuleId !== undefined ||
          source.accountId !== rule.template.accountId ||
          source.type !== rule.template.type
        ) {
          throw new InvalidRecurringOccurrenceSourceError();
        }

        const attached = await this.transactions.attachToRecurringRule(
          userId,
          source.id,
          ruleId,
          tx
        );
        if (attached === null) throw new InvalidRecurringOccurrenceSourceError();

        const confirmed = await this.occurrences.confirm(userId, occurrenceId, source.id, tx);
        if (confirmed === null) throw new RecurringOccurrenceAlreadyConfirmedError();

        await this.audit.record(userId, "recurring.occurrence.link-payment", occurrenceId, tx, {
          ruleId,
          transactionId: source.id
        });
        return confirmed;
      }
    );
  }
}
