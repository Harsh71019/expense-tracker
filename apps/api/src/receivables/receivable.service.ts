import { Inject, Injectable } from "@nestjs/common";
import {
  ReceivableSchema,
  type CreateReceivable,
  type CreateReceivableCorrection,
  type ListReceivableEventsQuery,
  type ListReceivablesQuery,
  type Receivable,
  type ReceivableEventPage,
  type ReceivableId,
  type ReceivableMutationResult,
  type ReceivablePage,
  type RecordReceivableRepayment,
  type StoredReceivable,
  type UpdateReceivableMetadata
} from "@treasury-ops/shared";

import { AuditRepository } from "../audit/audit.repository.js";
import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { withTxn } from "../common/db/db-txn.js";
import type { DbTx } from "../common/db/db-txn.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { ReceivableTransactionAlreadyLinkedError } from "../common/errors/receivable-transaction-already-linked.error.js";
import { ReceivableTransactionIneligibleError } from "../common/errors/receivable-transaction-ineligible.error.js";
import { TransactionRepository } from "../transactions/transaction.repository.js";
import { TransactionService } from "../transactions/transaction.service.js";
import {
  assertCorrectionWithinBounds,
  assertNotOverpaying,
  deriveReceivableStatus
} from "./receivable-policy.js";
import { ReceivableRepository, type ReceivableBalance } from "./receivable.repository.js";

@Injectable()
export class ReceivableService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb,
    private readonly receivables: ReceivableRepository,
    private readonly transactionsService: TransactionService,
    private readonly transactions: TransactionRepository,
    private readonly audit: AuditRepository
  ) {}

  create(userId: string, input: CreateReceivable): Promise<ReceivableMutationResult> {
    return withTxn(this.db, (tx) => this.createInTx(userId, input, tx));
  }

  async createInTx(
    userId: string,
    input: CreateReceivable,
    tx: DbTx,
    legacyAssetId?: string
  ): Promise<ReceivableMutationResult> {
    const stored = await this.receivables.create(userId, input, tx, legacyAssetId);

    let transactionId: string | undefined;
    let amountMinor: number;
    if (input.fundingMode === "lend_now") {
      const transaction = await this.transactionsService.createInTx(
        userId,
        {
          accountId: input.accountId,
          type: "expense",
          amountMinor: input.principalMinor,
          occurredAt: input.openedAt,
          description: input.description,
          tags: []
        },
        undefined,
        tx,
        "manual",
        "receivable_principal"
      );
      transactionId = transaction.id;
      amountMinor = input.principalMinor;
    } else {
      amountMinor = input.outstandingMinor;
    }

    const event = await this.receivables.insertEvent(
      userId,
      stored.id,
      { kind: "opening", amountMinor, occurredAt: input.openedAt, transactionId },
      tx
    );

    await this.audit.record(userId, "receivable.create", stored.id, tx, {
      fundingMode: input.fundingMode,
      eventId: event.id
    });

    const balance: ReceivableBalance = {
      outstandingMinor: amountMinor,
      confirmedRepaidMinor: 0,
      repaymentCount: 0,
      hasEffectiveOpening: true
    };
    return { receivable: toReceivable(stored, balance), event, transactionId };
  }

  async list(userId: string, query: ListReceivablesQuery): Promise<ReceivablePage> {
    const page = await this.receivables.list(userId, query);
    return {
      items: page.items.map((item) => toReceivable(item, item)),
      pageInfo: { nextCursor: page.nextCursor, hasMore: page.hasMore, limit: query.limit }
    };
  }

  async get(userId: string, receivableId: ReceivableId): Promise<Receivable> {
    const stored = await this.receivables.findById(userId, receivableId);
    if (stored === null) throw new EntityNotFoundError("Receivable");
    const balance = await this.receivables.getBalance(userId, receivableId);
    return toReceivable(stored, balance);
  }

  async listEvents(
    userId: string,
    receivableId: ReceivableId,
    query: ListReceivableEventsQuery
  ): Promise<ReceivableEventPage> {
    const stored = await this.receivables.findById(userId, receivableId);
    if (stored === null) throw new EntityNotFoundError("Receivable");
    const page = await this.receivables.listEvents(userId, receivableId, query);
    return {
      items: [...page.items],
      pageInfo: { nextCursor: page.nextCursor, hasMore: page.hasMore, limit: query.limit }
    };
  }

  updateMetadata(
    userId: string,
    receivableId: ReceivableId,
    patch: UpdateReceivableMetadata
  ): Promise<Receivable> {
    return withTxn(this.db, (tx) => this.updateMetadataInTx(userId, receivableId, patch, tx));
  }

  async updateMetadataInTx(
    userId: string,
    receivableId: ReceivableId,
    patch: UpdateReceivableMetadata,
    tx: DbTx
  ): Promise<Receivable> {
    const before = await this.receivables.findById(userId, receivableId, tx);
    if (before === null) throw new EntityNotFoundError("Receivable");

    const after = await this.receivables.updateMetadata(userId, receivableId, patch, tx);
    if (after === null) throw new EntityNotFoundError("Receivable");

    await this.audit.record(userId, "receivable.metadata.update", receivableId, tx, {
      fieldsChanged: Object.keys(patch)
    });

    const balance = await this.receivables.getBalance(userId, receivableId, tx);
    return toReceivable(after, balance);
  }

  recordRepayment(
    userId: string,
    receivableId: ReceivableId,
    input: RecordReceivableRepayment
  ): Promise<ReceivableMutationResult> {
    return withTxn(this.db, (tx) => this.recordRepaymentInTx(userId, receivableId, input, tx));
  }

  async recordRepaymentInTx(
    userId: string,
    receivableId: ReceivableId,
    input: RecordReceivableRepayment,
    tx: DbTx
  ): Promise<ReceivableMutationResult> {
    const stored = await this.receivables.findByIdForUpdate(userId, receivableId, tx);
    if (stored === null) throw new EntityNotFoundError("Receivable");
    const balance = await this.receivables.getBalance(userId, receivableId, tx);

    let transactionId: string;
    let amountMinor: number;
    let occurredAt: Date;
    let auditAction: string;

    if (input.captureMode === "receive_now") {
      assertNotOverpaying(balance.outstandingMinor, input.amountMinor);
      const transaction = await this.transactionsService.createInTx(
        userId,
        {
          accountId: input.accountId,
          type: "income",
          amountMinor: input.amountMinor,
          occurredAt: input.occurredAt,
          description: input.description,
          tags: []
        },
        undefined,
        tx,
        "manual",
        "receivable_principal"
      );
      transactionId = transaction.id;
      amountMinor = input.amountMinor;
      occurredAt = input.occurredAt;
      auditAction = "receivable.repayment.create";
    } else {
      const candidate = await this.transactions.findById(userId, input.transactionId, tx);
      if (candidate === null) throw new EntityNotFoundError("Transaction");
      if (
        candidate.type !== "income" ||
        candidate.status !== "posted" ||
        candidate.transferGroupId !== undefined
      ) {
        throw new ReceivableTransactionIneligibleError();
      }
      const existingLink = await this.receivables.findEventByTransactionId(
        userId,
        candidate.id,
        tx
      );
      if (existingLink !== null) throw new ReceivableTransactionAlreadyLinkedError();
      assertNotOverpaying(balance.outstandingMinor, candidate.amountMinor);

      const reclassified = await this.transactions.reclassifyPurpose(
        userId,
        candidate.id,
        "receivable_principal",
        tx
      );
      if (reclassified === null) throw new ReceivableTransactionIneligibleError();

      transactionId = candidate.id;
      amountMinor = candidate.amountMinor;
      occurredAt = candidate.occurredAt;
      auditAction = "receivable.repayment.link";
    }

    const event = await this.receivables.insertEvent(
      userId,
      receivableId,
      { kind: "repayment", amountMinor, occurredAt, transactionId },
      tx
    );

    await this.audit.record(userId, auditAction, receivableId, tx, {
      eventId: event.id,
      captureMode: input.captureMode
    });

    const after = await this.receivables.getBalance(userId, receivableId, tx);
    return { receivable: toReceivable(stored, after), event, transactionId };
  }

  createCorrection(
    userId: string,
    receivableId: ReceivableId,
    input: CreateReceivableCorrection
  ): Promise<ReceivableMutationResult> {
    return withTxn(this.db, (tx) => this.createCorrectionInTx(userId, receivableId, input, tx));
  }

  async createCorrectionInTx(
    userId: string,
    receivableId: ReceivableId,
    input: CreateReceivableCorrection,
    tx: DbTx
  ): Promise<ReceivableMutationResult> {
    const stored = await this.receivables.findByIdForUpdate(userId, receivableId, tx);
    if (stored === null) throw new EntityNotFoundError("Receivable");
    const balance = await this.receivables.getBalance(userId, receivableId, tx);
    assertCorrectionWithinBounds(balance.outstandingMinor, input.direction, input.amountMinor);

    const event = await this.receivables.insertEvent(
      userId,
      receivableId,
      {
        kind: input.direction === "increase" ? "correction_increase" : "correction_decrease",
        amountMinor: input.amountMinor,
        occurredAt: new Date(),
        reason: input.reason
      },
      tx
    );

    await this.audit.record(userId, "receivable.correction.create", receivableId, tx, {
      eventId: event.id,
      direction: input.direction
    });

    const after = await this.receivables.getBalance(userId, receivableId, tx);
    return { receivable: toReceivable(stored, after), event };
  }
}

function toReceivable(stored: StoredReceivable, balance: ReceivableBalance): Receivable {
  return ReceivableSchema.parse({
    id: stored.id,
    counterpartyName: stored.counterpartyName,
    note: stored.note,
    openedAt: stored.openedAt,
    dueAt: stored.dueAt,
    outstandingMinor: balance.outstandingMinor,
    confirmedRepaidMinor: balance.confirmedRepaidMinor,
    repaymentCount: balance.repaymentCount,
    status: deriveReceivableStatus(balance),
    isMigrated: stored.legacyAssetId !== undefined,
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt
  });
}
