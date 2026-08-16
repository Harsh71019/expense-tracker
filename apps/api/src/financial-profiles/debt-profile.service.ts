import { Injectable } from "@nestjs/common";
import {
  type CreateDeclaredDebt,
  type DeclaredDebt,
  type DeclaredDebtId,
  type DeclaredDebtPage,
  type ListDeclaredDebtsQuery,
  type UpdateDeclaredDebt
} from "@treasury-ops/shared";

import { LiabilityAssetReadService } from "../assets/liability-asset-read.service.js";
import type { LiabilityAssetRead } from "../assets/liability-asset-read.service.js";
import { AuditRepository } from "../audit/audit.repository.js";
import type { DbTx } from "../common/db/db-txn.js";
import { DeclaredDebtNotEditableError } from "../common/errors/declared-debt-not-editable.error.js";
import { DeclaredDebtNotFoundError } from "../common/errors/declared-debt-not-found.error.js";
import { LinkedAssetNotLoanLiabilityError } from "../common/errors/linked-asset-not-loan-liability.error.js";
import { LinkedAssetUnavailableError } from "../common/errors/linked-asset-unavailable.error.js";
import {
  IdempotencyPostgresService,
  type IdempotentResult
} from "../common/idempotency/idempotency-postgres.service.js";
import {
  highCostPolicy,
  StoredDeclaredDebtSchema,
  toDeclaredDebt,
  type StoredDeclaredDebt
} from "./debt-policy.js";
import { DeclaredDebtRepository } from "./debt-profile.repository.js";

/**
 * Business rules for declared debts.
 *
 * Everything here is planning metadata. No method posts a transaction, updates
 * an account balance, creates or closes an asset, or writes a valuation — a
 * real payoff is a ledger transaction the user records separately, and
 * "resolving" a debt only stops it counting in planning.
 */
@Injectable()
export class DebtProfileService {
  constructor(
    private readonly debts: DeclaredDebtRepository,
    private readonly liabilityAssets: LiabilityAssetReadService,
    private readonly audit: AuditRepository,
    private readonly idempotency: IdempotencyPostgresService
  ) {}

  /**
   * One page of debts, defaulting to the active ones. Linked debts have their
   * outstanding amount derived here, per read, from the asset's latest
   * valuation — nothing persists a second copy of that number.
   */
  async list(userId: string, query: ListDeclaredDebtsQuery): Promise<DeclaredDebtPage> {
    const page = await this.debts.list(userId, {
      cursor: query.cursor,
      limit: query.limit,
      status: query.status
    });

    const linkedAssets = await this.resolveLinkedAssets(userId, page.items);
    const highCostCount = await this.debts.countHighCost(userId, query.status);

    return {
      items: page.items.map((debt) =>
        toDeclaredDebt(
          debt,
          debt.linkedAssetId === null ? undefined : linkedAssets.get(debt.linkedAssetId)
        )
      ),
      pageInfo: { nextCursor: page.nextCursor, hasMore: page.hasMore, limit: query.limit },
      highCost: highCostPolicy(highCostCount)
    };
  }

  /**
   * Declares a debt. When it links to an asset, ownership and kind are checked
   * inside the same transaction as the insert, so a debt can never end up
   * pointing at an asset that was not an open `loan_liability` of this user.
   */
  async create(
    userId: string,
    input: CreateDeclaredDebt,
    key: string
  ): Promise<IdempotentResult<DeclaredDebt>> {
    const stored = await this.idempotency.execute(
      userId,
      "financial_profile.declared_debt.create",
      key,
      input,
      StoredDeclaredDebtSchema,
      async (tx) => {
        if (input.linkedAssetId !== null) {
          await this.requireOpenLoanLiability(userId, input.linkedAssetId, tx);
        }
        const debt = await this.debts.create(userId, input, tx);
        // Audit records shape, never an outstanding amount or minimum payment.
        await this.audit.record(userId, "financial_profile.declared_debt.create", debt.id, tx, {
          kind: debt.kind,
          status: debt.status,
          isLinked: debt.linkedAssetId !== null,
          annualRateBps: debt.annualRateBps
        });
        return debt;
      }
    );

    return { result: await this.compose(userId, stored.result), replayed: stored.replayed };
  }

  /**
   * Updates permitted metadata, or resolves the debt.
   *
   * `linkedAssetId` is not updatable by design: relinking is a different
   * decision with different ownership checks, so this path cannot silently
   * unlink a debt — not even if a later asset lookup fails.
   */
  async update(
    userId: string,
    debtId: DeclaredDebtId,
    input: UpdateDeclaredDebt,
    key: string
  ): Promise<IdempotentResult<DeclaredDebt>> {
    const stored = await this.idempotency.execute(
      userId,
      "financial_profile.declared_debt.update",
      key,
      { debtId, ...input },
      StoredDeclaredDebtSchema,
      async (tx) => {
        const existing = await this.debts.findById(userId, debtId, tx);
        if (existing === null) throw new DeclaredDebtNotFoundError();
        this.assertUpdatable(existing, input);

        const resolving = input.status === "resolved";
        const updated = await this.debts.updateActive(
          userId,
          debtId,
          {
            ...(input.name === undefined ? {} : { name: input.name }),
            ...(input.kind === undefined ? {} : { kind: input.kind }),
            ...(input.declaredOutstandingMinor === undefined
              ? {}
              : { declaredOutstandingMinor: input.declaredOutstandingMinor }),
            ...(input.annualRateBps === undefined ? {} : { annualRateBps: input.annualRateBps }),
            ...(input.minimumPaymentMinor === undefined
              ? {}
              : { minimumPaymentMinor: input.minimumPaymentMinor }),
            ...(resolving ? { status: "resolved" as const, resolvedAt: new Date() } : {})
          },
          tx
        );
        if (updated === null) throw new DeclaredDebtNotFoundError();

        await this.audit.record(userId, "financial_profile.declared_debt.update", updated.id, tx, {
          kind: updated.kind,
          status: updated.status,
          isLinked: updated.linkedAssetId !== null,
          annualRateBps: updated.annualRateBps,
          resolved: resolving
        });
        return updated;
      }
    );

    return { result: await this.compose(userId, stored.result), replayed: stored.replayed };
  }

  /** Rejects the two update shapes the data model does not support. */
  private assertUpdatable(existing: StoredDeclaredDebt, input: UpdateDeclaredDebt): void {
    if (existing.status === "resolved") {
      throw new DeclaredDebtNotEditableError(
        "This debt is already resolved. Declare a new debt instead of reopening this one."
      );
    }
    if (input.declaredOutstandingMinor !== undefined && existing.linkedAssetId !== null) {
      throw new DeclaredDebtNotEditableError(
        "This debt takes its outstanding amount from the linked asset's latest valuation. Record a new valuation on the asset instead."
      );
    }
  }

  private async requireOpenLoanLiability(userId: string, assetId: string, tx: DbTx): Promise<void> {
    const lookup = await this.liabilityAssets.findOpenLoanLiability(userId, assetId, tx);
    if (lookup.outcome === "not_found") throw new LinkedAssetUnavailableError();
    if (lookup.outcome === "not_loan_liability") throw new LinkedAssetNotLoanLiabilityError();
  }

  private async compose(userId: string, stored: StoredDeclaredDebt): Promise<DeclaredDebt> {
    const linkedAssets = await this.resolveLinkedAssets(userId, [stored]);
    return toDeclaredDebt(
      stored,
      stored.linkedAssetId === null ? undefined : linkedAssets.get(stored.linkedAssetId)
    );
  }

  private async resolveLinkedAssets(
    userId: string,
    debts: readonly StoredDeclaredDebt[]
  ): Promise<ReadonlyMap<string, LiabilityAssetRead>> {
    const assetIds = [
      ...new Set(
        debts
          .map((debt) => debt.linkedAssetId)
          .filter((assetId): assetId is string => assetId !== null)
      )
    ];
    return this.liabilityAssets.findLoanLiabilitiesByIds(userId, assetIds);
  }
}
