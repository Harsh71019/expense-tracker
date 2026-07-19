import { Inject, Injectable } from "@nestjs/common";
import { type CreateTransfer, type Transaction, type TransferGroupId } from "@vyaya/shared";
import { Logger } from "nestjs-pino";

import { AccountRepository } from "../accounts/account.repository.js";
import { AuditRepository } from "../audit/audit.repository.js";
import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { withTxn } from "../common/db/db-txn.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { TransactionNotReversibleError } from "../common/errors/transaction-not-reversible.error.js";
import { LogEvent } from "../common/logging/events.js";
import { TransactionRepository } from "./transaction.repository.js";
import { isUniqueViolation } from "./transaction.service.js";

export type TransferResult = Readonly<{
  transferGroupId: string;
  fromTransaction: Transaction;
  toTransaction: Transaction;
  replayed: boolean;
}>;

export type TransferReverseResult = Readonly<{
  transferGroupId: string;
  legs: [Transaction, Transaction];
  replayed: boolean;
}>;

type TransferLogger = Pick<Logger, "log" | "warn">;

@Injectable()
export class TransferService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb,
    private readonly accounts: AccountRepository,
    private readonly transactions: TransactionRepository,
    private readonly audit: AuditRepository,
    @Inject(Logger) private readonly logger: TransferLogger
  ) {}

  async create(
    userId: string,
    input: CreateTransfer,
    idempotencyKey: string | undefined
  ): Promise<TransferResult> {
    try {
      const transfer = await withTxn(this.db, async (tx) => {
        if (
          !(await this.accounts.applyBalanceDelta(
            userId,
            input.fromAccountId,
            -input.amountMinor,
            tx
          ))
        ) {
          throw new EntityNotFoundError("Account");
        }
        if (
          !(await this.accounts.applyBalanceDelta(userId, input.toAccountId, input.amountMinor, tx))
        ) {
          throw new EntityNotFoundError("Account");
        }

        const transferGroupId = crypto.randomUUID();
        const fromTransaction = await this.transactions.create(
          userId,
          {
            accountId: input.fromAccountId,
            type: "expense",
            amountMinor: input.amountMinor,
            occurredAt: input.occurredAt,
            description: input.description,
            tags: input.tags
          },
          idempotencyKey,
          tx,
          transferGroupId
        );
        const toTransaction = await this.transactions.create(
          userId,
          {
            accountId: input.toAccountId,
            type: "income",
            amountMinor: input.amountMinor,
            occurredAt: input.occurredAt,
            description: input.description,
            tags: input.tags
          },
          undefined,
          tx,
          transferGroupId
        );

        await this.audit.record(userId, "transfer.create", fromTransaction.id, tx);
        await this.audit.record(userId, "transfer.create", toTransaction.id, tx);

        return { transferGroupId, fromTransaction, toTransaction };
      });
      this.logger.log(
        {
          event: LogEvent.TransferCreated,
          transferGroupId: transfer.transferGroupId,
          fromAccountId: input.fromAccountId,
          toAccountId: input.toAccountId,
          amountMinor: input.amountMinor
        },
        "transfer created"
      );
      return { ...transfer, replayed: false };
    } catch (error) {
      if (idempotencyKey === undefined || !isUniqueViolation(error)) throw error;
      const fromTransaction = await this.transactions.findByIdempotencyKey(userId, idempotencyKey);
      if (fromTransaction === null || fromTransaction.transferGroupId === undefined) throw error;
      const legs = await this.transactions.findLegsByTransferGroupId(
        userId,
        fromTransaction.transferGroupId
      );
      const toTransaction = legs.find((leg) => leg.id !== fromTransaction.id);
      if (toTransaction === undefined) throw error;
      this.logger.warn(
        {
          event: LogEvent.IdempotencyDuplicate,
          key: idempotencyKey,
          originalTxnId: fromTransaction.id
        },
        "idempotent transfer replay served"
      );
      return {
        transferGroupId: fromTransaction.transferGroupId,
        fromTransaction,
        toTransaction,
        replayed: true
      };
    }
  }

  async reverse(userId: string, transferGroupId: TransferGroupId): Promise<TransferReverseResult> {
    try {
      const reversal = await withTxn(this.db, async (tx) => {
        const legs = await this.transactions.findPostedLegsByTransferGroupId(
          userId,
          transferGroupId,
          tx
        );
        if (legs.length !== 2) {
          const existing = await this.transactions.findLegsByTransferGroupId(
            userId,
            transferGroupId
          );
          if (existing.length === 0) throw new EntityNotFoundError("Transfer");
          throw new TransactionNotReversibleError();
        }

        const newTransferGroupId = crypto.randomUUID();
        const reversedLegs: Transaction[] = [];
        for (const leg of legs) {
          const reversalLeg = await this.transactions.createReversal(
            userId,
            leg,
            tx,
            newTransferGroupId
          );
          if (!(await this.transactions.markReversed(userId, leg.id, reversalLeg.id, tx))) {
            throw new TransactionNotReversibleError();
          }
          const deltaMinor = leg.type === "expense" ? leg.amountMinor : -leg.amountMinor;
          if (!(await this.accounts.applyBalanceDelta(userId, leg.accountId, deltaMinor, tx))) {
            throw new EntityNotFoundError("Account");
          }
          await this.audit.record(userId, "transfer.reverse", reversalLeg.id, tx);
          reversedLegs.push(reversalLeg);
        }

        return legsPair(newTransferGroupId, reversedLegs);
      });
      this.logger.log(
        { event: LogEvent.TransferReversed, transferGroupId: reversal.transferGroupId },
        "transfer reversed"
      );
      return { ...reversal, replayed: false };
    } catch (error) {
      const legs = await this.transactions.findLegsByTransferGroupId(userId, transferGroupId);
      if (legs.length !== 2) throw error;

      const reversals = await Promise.all(
        legs.map((leg) => this.transactions.findByReversalOf(userId, leg.id))
      );
      const [first, second] = reversals;
      if (first === null || first === undefined || second === null || second === undefined)
        throw error;
      if (first.transferGroupId === undefined) throw error;

      this.logger.warn(
        { event: LogEvent.IdempotencyDuplicate, originalTxnId: first.id },
        "transfer reversal replay served"
      );
      return { ...legsPair(first.transferGroupId, [first, second]), replayed: true };
    }
  }
}

function legsPair(
  transferGroupId: string,
  legs: Transaction[]
): { transferGroupId: string; legs: [Transaction, Transaction] } {
  const [first, second] = legs;
  if (first === undefined || second === undefined) {
    throw new TransactionNotReversibleError();
  }
  return { transferGroupId, legs: [first, second] };
}
