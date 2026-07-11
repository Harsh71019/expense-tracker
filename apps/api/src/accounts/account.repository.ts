import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { AccountSchema, type Account, type AccountId, type CreateAccount } from "@vyaya/shared";
import { Types } from "mongoose";
import type { Connection } from "mongoose";

import type { MongoSession } from "../common/mongo-txn.js";

const ACCOUNTS_COLLECTION = "accounts";

@Injectable()
export class AccountRepository {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async create(userId: string, input: CreateAccount, session: MongoSession): Promise<Account> {
    const now = new Date();
    const account = {
      userId,
      ...input,
      currency: "INR" as const,
      balanceMinor: input.openingBalanceMinor,
      isArchived: false,
      createdAt: now,
      updatedAt: now
    };
    const result = await this.database()
      .collection(ACCOUNTS_COLLECTION)
      .insertOne(account, { session });

    return AccountSchema.parse({ id: result.insertedId.toString(), ...account });
  }

  async list(userId: string): Promise<Account[]> {
    const accounts = await this.database()
      .collection(ACCOUNTS_COLLECTION)
      .find({ userId, isArchived: false })
      .sort({ name: 1 })
      .toArray();

    return accounts.map((account) =>
      AccountSchema.parse({ id: account._id.toString(), ...account })
    );
  }

  async archive(userId: string, accountId: AccountId): Promise<boolean> {
    const result = await this.database()
      .collection(ACCOUNTS_COLLECTION)
      .updateOne(
        { _id: new Types.ObjectId(accountId), userId, isArchived: false },
        { $set: { isArchived: true, updatedAt: new Date() } }
      );

    return result.modifiedCount === 1;
  }

  async applyBalanceDelta(
    userId: string,
    accountId: AccountId,
    deltaMinor: number,
    session: MongoSession
  ): Promise<boolean> {
    const result = await this.database()
      .collection(ACCOUNTS_COLLECTION)
      .updateOne(
        { _id: new Types.ObjectId(accountId), userId, isArchived: false },
        { $inc: { balanceMinor: deltaMinor }, $set: { updatedAt: new Date() } },
        { session }
      );
    return result.modifiedCount === 1;
  }

  private database(): NonNullable<Connection["db"]> {
    const database = this.connection.db;
    if (database === undefined) {
      throw new Error("MongoDB connection is not ready");
    }

    return database;
  }
}
