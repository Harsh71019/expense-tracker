import { Injectable } from "@nestjs/common";
import {
  AccountSchema,
  BillPaymentResultSchema,
  computeNextCreditCardStatementAt,
  type Account,
  type AccountId,
  type BillDetail,
  type BillPage,
  type BillPaymentResult,
  type CreditCardBill,
  type CreditCardBillId,
  type CreditCardConfigInput,
  type ListBillsQuery,
  type PayCreditCardBill
} from "@treasury-ops/shared";

import { AccountRepository } from "../accounts/account.repository.js";
import { AuditRepository } from "../audit/audit.repository.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { BillNotReconciledError } from "../common/errors/bill-not-reconciled.error.js";
import { BillOverpaymentError } from "../common/errors/bill-overpayment.error.js";
import { InvalidCreditCardAccountError } from "../common/errors/invalid-credit-card-account.error.js";
import {
  IdempotencyPostgresService,
  type IdempotentResult
} from "../common/idempotency/idempotency-postgres.service.js";
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

  async getBill(userId: string, billId: CreditCardBillId): Promise<CreditCardBill> {
    const bill = await this.bills.findById(userId, billId);
    if (bill === null) throw new EntityNotFoundError("Bill");
    return bill;
  }
}

function dayAfter(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
}
