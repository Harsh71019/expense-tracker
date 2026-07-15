import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { AssetSchema, type Asset, type AssetId, type CreateAsset } from "@vyaya/shared";
import { Types } from "mongoose";
import type { Connection } from "mongoose";

import type { MongoSession } from "../common/mongo-txn.js";

const ASSETS_COLLECTION = "net_worth_assets";

@Injectable()
export class AssetRepository {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async create(userId: string, input: CreateAsset, session: MongoSession): Promise<Asset> {
    const now = new Date();
    const maturityAt = input.maturityAt === undefined ? {} : { maturityAt: input.maturityAt };
    const annualRateBps =
      input.annualRateBps === undefined ? {} : { annualRateBps: input.annualRateBps };
    const quantityMilliUnits =
      input.quantityMilliUnits === undefined
        ? {}
        : { quantityMilliUnits: input.quantityMilliUnits };
    const asset = {
      userId,
      kind: input.kind,
      name: input.name,
      openedAt: input.openedAt,
      ...maturityAt,
      ...annualRateBps,
      ...quantityMilliUnits,
      isClosed: false,
      createdAt: now,
      updatedAt: now
    };
    const result = await this.database()
      .collection(ASSETS_COLLECTION)
      .insertOne(asset, { session });

    return AssetSchema.parse({ id: result.insertedId.toString(), ...asset });
  }

  async list(userId: string): Promise<Asset[]> {
    const assets = await this.database()
      .collection(ASSETS_COLLECTION)
      .find({ userId, isClosed: false })
      .sort({ name: 1 })
      .toArray();

    return assets.map((asset) => AssetSchema.parse({ id: asset._id.toString(), ...asset }));
  }

  async findOpenById(
    userId: string,
    assetId: AssetId,
    session: MongoSession
  ): Promise<Asset | null> {
    const asset = await this.database()
      .collection(ASSETS_COLLECTION)
      .findOne({ _id: new Types.ObjectId(assetId), userId, isClosed: false }, { session });
    return asset === null ? null : AssetSchema.parse({ id: asset._id.toString(), ...asset });
  }

  async close(userId: string, assetId: AssetId, session: MongoSession): Promise<boolean> {
    const result = await this.database()
      .collection(ASSETS_COLLECTION)
      .updateOne(
        { _id: new Types.ObjectId(assetId), userId, isClosed: false },
        { $set: { isClosed: true, updatedAt: new Date() } },
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
