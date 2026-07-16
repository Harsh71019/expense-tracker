import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { AccountSchema, type Account } from "@vyaya/shared";
import type { Connection } from "mongoose";

const ACCOUNTS_COLLECTION = "accounts";
const TRANSACTIONS_COLLECTION = "transactions";

type DeltaGroup = Readonly<{ _id: unknown; netMinor: number }>;

/**
 * Reads `accounts`/`transactions` directly rather than going through
 * AccountRepository/TransactionRepository — this is a read-only,
 * cross-user verification sweep with a different access shape (every
 * account, not one user's), and mirrors the precedent already set by
 * MonthlyRollupRepository reading `transactions` directly instead of
 * depending on TransactionRepository.
 */
@Injectable()
export class BalanceVerifyRepository {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  /** Every account regardless of isArchived — an archived account's cached balance still has to be internally consistent. */
  async findAllAccounts(): Promise<Account[]> {
    const documents = await this.database().collection(ACCOUNTS_COLLECTION).find({}).toArray();
    return documents.map((document) =>
      AccountSchema.parse({ id: objectIdString(document._id), ...document })
    );
  }

  /**
   * Every transaction ever inserted for an account keeps contributing its
   * own original delta forever — a reversal never removes the original's
   * contribution, it adds an opposite-signed document of its own (see
   * TransactionService.reverse). Summing every document's signed
   * amountMinor, regardless of current status, reconstructs exactly what
   * applyBalanceDelta has cumulatively applied — so status is deliberately
   * not filtered here, unlike ExportService/MonthlyRollupRepository's
   * "posted" filter (those read *current* state, this reconstructs *history*).
   */
  async sumDeltasByAccount(): Promise<Map<string, number>> {
    const groups = await this.database()
      .collection(TRANSACTIONS_COLLECTION)
      .aggregate<DeltaGroup>([
        {
          $group: {
            _id: "$accountId",
            netMinor: {
              $sum: {
                $cond: [
                  { $eq: ["$type", "income"] },
                  "$amountMinor",
                  { $multiply: ["$amountMinor", -1] }
                ]
              }
            }
          }
        }
      ])
      .toArray();
    return new Map(groups.map((group) => [objectIdString(group._id), group.netMinor]));
  }

  private database(): NonNullable<Connection["db"]> {
    const database = this.connection.db;
    if (database === undefined) {
      throw new Error("MongoDB connection is not ready");
    }
    return database;
  }
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
