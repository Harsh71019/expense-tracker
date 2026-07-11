import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { CategorySchema, type Category, type CategoryId, type CreateCategory } from "@vyaya/shared";
import { Types } from "mongoose";
import type { Connection } from "mongoose";

const CATEGORIES_COLLECTION = "categories";

@Injectable()
export class CategoryRepository {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async create(userId: string, input: CreateCategory): Promise<Category> {
    const now = new Date();
    const category = { userId, ...input, isArchived: false, createdAt: now, updatedAt: now };
    const result = await this.database().collection(CATEGORIES_COLLECTION).insertOne(category);
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

  async archive(userId: string, categoryId: CategoryId): Promise<boolean> {
    const result = await this.database()
      .collection(CATEGORIES_COLLECTION)
      .updateOne(
        { _id: new Types.ObjectId(categoryId), userId, isArchived: false },
        { $set: { isArchived: true, updatedAt: new Date() } }
      );
    return result.modifiedCount === 1;
  }

  private database(): NonNullable<Connection["db"]> {
    const database = this.connection.db;
    if (database === undefined) throw new Error("MongoDB connection is not ready");
    return database;
  }
}
