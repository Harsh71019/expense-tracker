import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { CategorySchema, type Category, type CategoryId, type CreateCategory } from "@vyaya/shared";
import { Types } from "mongoose";
import type { Connection } from "mongoose";

import type { MongoSession } from "../common/mongo-txn.js";

const CATEGORIES_COLLECTION = "categories";

@Injectable()
export class CategoryRepository {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async create(userId: string, input: CreateCategory, session?: MongoSession): Promise<Category> {
    const now = new Date();
    const category = { userId, ...input, isArchived: false, createdAt: now, updatedAt: now };
    const result = await this.database()
      .collection(CATEGORIES_COLLECTION)
      .insertOne(category, session === undefined ? {} : { session });
    return CategorySchema.parse({ id: result.insertedId.toString(), ...category });
  }

  async list(userId: string): Promise<Category[]> {
    const categories = await this.database()
      .collection(CATEGORIES_COLLECTION)
      .find({ userId, isArchived: false })
      .sort({ kind: 1, name: 1 })
      .toArray();
    return categories.map((category) =>
      CategorySchema.parse({ id: category._id.toString(), ...category })
    );
  }

  async archive(userId: string, categoryId: CategoryId, session?: MongoSession): Promise<boolean> {
    const result = await this.database()
      .collection(CATEGORIES_COLLECTION)
      .updateOne(
        { _id: new Types.ObjectId(categoryId), userId, isArchived: false },
        { $set: { isArchived: true, updatedAt: new Date() } },
        session === undefined ? {} : { session }
      );
    return result.modifiedCount === 1;
  }

  async exists(userId: string, categoryId: CategoryId, session: MongoSession): Promise<boolean> {
    const category = await this.database()
      .collection(CATEGORIES_COLLECTION)
      .findOne(
        { _id: new Types.ObjectId(categoryId), userId, isArchived: false },
        { session, projection: { _id: 1 } }
      );
    return category !== null;
  }

  async findActiveById(
    userId: string,
    categoryId: CategoryId,
    session?: MongoSession
  ): Promise<Category | null> {
    const category = await this.database()
      .collection(CATEGORIES_COLLECTION)
      .findOne(
        { _id: new Types.ObjectId(categoryId), userId, isArchived: false },
        session === undefined ? {} : { session }
      );
    return category === null
      ? null
      : CategorySchema.parse({ id: category._id.toString(), ...category });
  }

  private database(): NonNullable<Connection["db"]> {
    const database = this.connection.db;
    if (database === undefined) throw new Error("MongoDB connection is not ready");
    return database;
  }
}
