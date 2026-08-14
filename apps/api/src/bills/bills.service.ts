import { Injectable } from "@nestjs/common";
import {
  AccountSchema,
  BillPaymentResultSchema,
  computeNextCreditCardStatementAt,
  CreditCardPaymentResultSchema,
  type Account,
  type AccountId,
  type BillDetail,
  type BillPage,
  type BillPaymentResult,
  type CreateCreditCardPayment,
  type CreditCardBill,
  type CreditCardBillId,
  type CreditCardConfigInput,
  type CreditCardPaymentResult,
  type LinkBillPayment,
  type ListBillsQuery,
  type PayCreditCardBill,
  type Transaction,
  type Transfer
} from "@treasury-ops/shared";

import { AccountRepository } from "../accounts/account.repository.js";
import { assertBalanceDeltaApplied } from "../accounts/balance-delta.js";
import { AuditRepository } from "../audit/audit.repository.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { BillPaymentAccountMismatchError } from "../common/errors/bill-payment-account-mismatch.error.js";
import { BillPaymentAmountMismatchError } from "../common/errors/bill-payment-amount-mismatch.error.js";
import { BillNotReconciledError } from "../common/errors/bill-not-reconciled.error.js";
import { BillOverpaymentError } from "../common/errors/bill-overpayment.error.js";
import { InvalidBillPaymentSourceError } from "../common/errors/invalid-bill-payment-source.error.js";
import { InvalidCreditCardAccountError } from "../common/errors/invalid-credit-card-account.error.js";
import {
  IdempotencyPostgresService,
  type IdempotentResult
} from "../common/idempotency/idempotency-postgres.service.js";
import type { DbTx } from "../common/db/db-txn.js";
import { TransactionRepository } from "../transactions/transaction.repository.js";
import { TransferService } from "../transactions/transfer.service.js";
import { BillStatementRepository } from "./bill-statement.repository.js";
import { CreditCardBillRepository } from "./credit-card-bill.repository.js";

@Injectable()
export class BillsService {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly bills: CreditCardBillRepository,
    private readonly statements: BillStatementRepository,
    private readonly transactions: TransactionRepository,
    private readonly transfers: TransferService,
    private readonly audit: AuditRepository,
    private readonly idempotency: IdempotencyPostgresService
  ) {}

  updateCreditCardConfig(
    userId: string,
    accountId: AccountId,
    input: CreditCardConfigInput,
    key: string
  ): Promise<IdempotentResult<Account>> {
    const nextStatementAt = computeNextCreditCardStatementAt(input.statementDay, new Date());
    return this.idempotency.execute(
      userId,
      "credit-card.config.update",
      key,
      { accountId, input },
      AccountSchema,
      async (tx) => {
        const account = await this.accounts.findActiveById(userId, accountId, tx);
        if (account === null) throw new EntityNotFoundError("Account");
        if (account.type !== "credit_card") throw new InvalidCreditCardAccountError();
        const updated = await this.accounts.updateCreditCardConfig(
          userId,
          accountId,
          input,
          nextStatementAt,
          tx
        );
        if (updated === null) throw new EntityNotFoundError("Account");
        await this.audit.record(userId, "credit-card.config.update", accountId, tx, {
          statementDay: input.statementDay,
          dueDay: input.dueDay
        });
        return updated;
      }
    );
  }

  list(userId: string, query: ListBillsQuery): Promise<BillPage> {
    return this.bills.findMany(userId, query);
  }

  async get(userId: string, billId: CreditCardBillId): Promise<BillDetail> {
    const bill = await this.getBill(userId, billId);
    const account = await this.accounts.findById(userId, bill.accountId);
    if (account === null) throw new EntityNotFoundError("Account");
    const activeStatement = await this.statements.findActiveByBillId(userId, billId);
    if (activeStatement === null) {
      return {
        bill,
        account,
        reconciliation: {
          stats: { total: 0, matched: 0, missing: 0, ambiguous: 0, acknowledged: 0 },
          unresolved: 0,
          canReconcile: false,
          extraTransactions: []
        }
      };
    }

    const matched = await this.statements.findMatchedTransactionIds(userId, activeStatement.id);
    const candidates = await this.transactions.findReconciliationCandidates(
      userId,
      bill.accountId,
      bill.cycleStart,
      dayAfter(bill.cycleEnd)
    );
    const extraTransactions = candidates.filter((transaction) => !matched.has(transaction.id));
    const unresolved = Math.max(
      0,
      activeStatement.stats.total -
        activeStatement.stats.matched -
        activeStatement.stats.acknowledged
    );
    return {
      bill,
      account,
      activeStatement,
      reconciliation: {
        stats: activeStatement.stats,
        unresolved,
        canReconcile: activeStatement.status === "staged" && unresolved === 0,
        extraTransactions
      }
    };
  }

  pay(
    userId: string,
    billId: CreditCardBillId,
    input: PayCreditCardBill,
    key: string
  ): Promise<IdempotentResult<BillPaymentResult>> {
    return this.idempotency.execute(
      userId,
      "credit-card.bill.pay",
      key,
      { billId, input },
      BillPaymentResultSchema,
      async (tx) => {
        const bill = await this.bills.findByIdForUpdate(userId, billId, tx);
        if (bill === null) throw new EntityNotFoundError("Bill");
        if (bill.reconciliationStatus !== "reconciled") throw new BillNotReconciledError();
        if (bill.remainingMinor <= 0 || input.amountMinor > bill.remainingMinor) {
          throw new BillOverpaymentError();
        }

        const source = await this.accounts.findActiveById(userId, input.fromAccountId, tx);
        if (source === null || source.id === bill.accountId || source.type === "credit_card") {
          throw new EntityNotFoundError("Eligible payment source account");
        }

        const transfer = await this.transfers.createInTx(
          userId,
          {
            fromAccountId: source.id,
            toAccountId: bill.accountId,
            amountMinor: input.amountMinor,
            occurredAt: input.occurredAt,
            description: "Credit card bill payment",
            tags: ["credit-card-bill"]
          },
          tx,
          { toLegBillId: bill.id }
        );
        await this.audit.record(userId, "credit-card.bill.pay", bill.id, tx, {
          transferGroupId: transfer.transferGroupId
        });
        const updated = await this.bills.findById(userId, bill.id, tx);
        if (updated === null) throw new EntityNotFoundError("Bill");
        return {
          bill: updated,
          transfer: {
            transferGroupId: transfer.transferGroupId,
            fromTransaction: transfer.fromTransaction,
            toTransaction: transfer.toTransaction
          }
        };
      }
    );
  }

  linkPayment(
    userId: string,
    billId: CreditCardBillId,
    input: LinkBillPayment,
    key: string
  ): Promise<IdempotentResult<BillPaymentResult>> {
    return this.idempotency.execute(
      userId,
      "credit-card.bill.link-payment",
      key,
      { billId, input },
      BillPaymentResultSchema,
      async (tx) => {
        const bill = await this.bills.findByIdForUpdate(userId, billId, tx);
        if (bill === null) throw new EntityNotFoundError("Bill");
        if (bill.remainingMinor <= 0) throw new BillOverpaymentError();

        const source = await this.getEligiblePaymentSource(
          userId,
          input.transactionId,
          bill.accountId,
          tx
        );
        if (source.amountMinor > bill.remainingMinor) throw new BillOverpaymentError();
        if (input.amountMinor !== undefined && input.amountMinor !== source.amountMinor) {
          throw new BillPaymentAmountMismatchError();
        }

        const transfer = await this.appendCreditCardPaymentLeg(
          userId,
          source,
          bill.accountId,
          bill.id,
          tx
        );
        await this.audit.record(userId, "credit-card.bill.link-payment", bill.id, tx, {
          transferGroupId: transfer.transferGroupId,
          sourceTransactionId: source.id
        });
        const updated = await this.bills.findById(userId, bill.id, tx);
        if (updated === null) throw new EntityNotFoundError("Bill");
        return {
          bill: updated,
          transfer
        };
      }
    );
  }

  linkCreditCardPayment(
    userId: string,
    input: CreateCreditCardPayment,
    key: string
  ): Promise<IdempotentResult<CreditCardPaymentResult>> {
    return this.idempotency.execute(
      userId,
      "credit-card.payment.link",
      key,
      input,
      CreditCardPaymentResultSchema,
      async (tx) => {
        const lockedBill =
          input.billId === undefined
            ? undefined
            : await this.bills.findByIdForUpdate(userId, input.billId, tx);
        if (input.billId !== undefined && lockedBill === null) {
          throw new EntityNotFoundError("Bill");
        }
        const bill = lockedBill ?? undefined;
        if (bill !== undefined && bill.accountId !== input.creditCardAccountId) {
          throw new BillPaymentAccountMismatchError();
        }

        const source = await this.getEligiblePaymentSource(
          userId,
          input.transactionId,
          input.creditCardAccountId,
          tx
        );
        if (bill !== undefined && source.amountMinor > bill.remainingMinor) {
          throw new BillOverpaymentError();
        }

        const transfer = await this.appendCreditCardPaymentLeg(
          userId,
          source,
          input.creditCardAccountId,
          bill?.id,
          tx
        );
        await this.audit.record(userId, "credit-card.payment.link", source.id, tx, {
          transferGroupId: transfer.transferGroupId,
          creditCardAccountId: input.creditCardAccountId,
          ...(bill === undefined ? {} : { billId: bill.id })
        });

        if (bill === undefined) return { transfer };
        const updated = await this.bills.findById(userId, bill.id, tx);
        if (updated === null) throw new EntityNotFoundError("Bill");
        return { transfer, bill: updated };
      }
    );
  }

  async getBill(userId: string, billId: CreditCardBillId): Promise<CreditCardBill> {
    const bill = await this.bills.findById(userId, billId);
    if (bill === null) throw new EntityNotFoundError("Bill");
    return bill;
  }

  private async getEligiblePaymentSource(
    userId: string,
    transactionId: string,
    creditCardAccountId: AccountId,
    tx: DbTx
  ): Promise<Transaction> {
    const source = await this.transactions.findById(userId, transactionId, tx);
    if (
      source === null ||
      source.type !== "expense" ||
      source.status !== "posted" ||
      source.transferGroupId !== undefined ||
      source.billId !== undefined ||
      source.accountId === creditCardAccountId
    ) {
      throw new InvalidBillPaymentSourceError();
    }
    const sourceAccount = await this.accounts.findActiveById(userId, source.accountId, tx);
    if (sourceAccount === null || sourceAccount.type === "credit_card") {
      throw new InvalidBillPaymentSourceError();
    }
    return source;
  }

  private async appendCreditCardPaymentLeg(
    userId: string,
    source: Transaction,
    creditCardAccountId: AccountId,
    billId: CreditCardBillId | undefined,
    tx: DbTx
  ): Promise<Transfer> {
    const card = await this.accounts.findActiveById(userId, creditCardAccountId, tx);
    if (card === null || card.type !== "credit_card") throw new InvalidCreditCardAccountError();

    const transferGroupId = crypto.randomUUID();
    const attached = await this.transactions.attachToTransferGroup(
      userId,
      source.id,
      transferGroupId,
      tx
    );
    if (attached === null) throw new InvalidBillPaymentSourceError();

    assertBalanceDeltaApplied(
      await this.accounts.applyBalanceDelta(userId, card.id, source.amountMinor, tx)
    );
    const creditLeg = await this.transactions.create(
      userId,
      {
        accountId: card.id,
        type: "income",
        amountMinor: source.amountMinor,
        occurredAt: source.occurredAt,
        description: `Credit card payment · ${source.description}`.slice(0, 500),
        tags: ["credit-card-bill"]
      },
      undefined,
      tx,
      transferGroupId,
      "manual",
      billId
    );
    return { transferGroupId, fromTransaction: attached, toTransaction: creditLeg };
  }
}

function dayAfter(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
}
