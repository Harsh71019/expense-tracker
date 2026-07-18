import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import {
  CategoryRuleSchema,
  type CategoryRule,
  type CategoryRuleId,
  type CreateCategoryRule
} from "@vyaya/shared";
import { Types } from "mongoose";
import type { Connection } from "mongoose";

import type { MongoSession } from "../common/mongo-txn.js";

const CATEGORY_RULES_COLLECTION = "category_rules";

@Injectable()
export class CategoryRuleRepository {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async create(
    userId: string,
    input: CreateCategoryRule,
    session?: MongoSession
  ): Promise<CategoryRule> {
    const now = new Date();
    const document = {
      userId,
      pattern: input.pattern,
      categoryId: new Types.ObjectId(input.categoryId),
      createdAt: now,
      updatedAt: now
    };
    const result = await this.database()
      .collection(CATEGORY_RULES_COLLECTION)
      .insertOne(document, session === undefined ? {} : { session });
    return this.toCategoryRule({ _id: result.insertedId, ...document });
  }

  async list(userId: string): Promise<CategoryRule[]> {
    const rules = await this.database()
      .collection(CATEGORY_RULES_COLLECTION)
      .find({ userId })
      .sort({ pattern: 1 })
      .toArray();
    return rules.map((rule) => this.toCategoryRule(rule));
  }

  async delete(userId: string, ruleId: CategoryRuleId, session?: MongoSession): Promise<boolean> {
    const result = await this.database()
      .collection(CATEGORY_RULES_COLLECTION)
      .deleteOne(
        { _id: new Types.ObjectId(ruleId), userId },
        session === undefined ? {} : { session }
      );
    return result.deletedCount === 1;
  }

  private toCategoryRule(value: Record<string, unknown>): CategoryRule {
    const { _id, categoryId, ...rest } = value;
    return CategoryRuleSchema.parse({
      id: objectIdString(_id),
      categoryId: objectIdString(categoryId),
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
