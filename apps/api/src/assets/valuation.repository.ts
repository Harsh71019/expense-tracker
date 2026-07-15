import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { ValuationSchema, type AssetId, type CreateValuation, type Valuation } from "@vyaya/shared";
import { Types } from "mongoose";
import type { Connection } from "mongoose";
import { z } from "zod";

import type { MongoSession } from "../common/mongo-txn.js";

const VALUATIONS_COLLECTION = "asset_valuations";

const StoredValuationSchema = z.object({
  _id: z.unknown(),
  userId: z.string(),
  assetId: z.unknown(),
  valueMinor: z.number().int(),
  valuedAt: z.date(),
  source: z.enum(["manual", "maturity_projection"]),
  createdAt: z.date()
});

const LatestValuationSchema = z.object({
  _id: z.unknown(),
  valueMinor: z.number().int(),
  valuedAt: z.date()
});

@Injectable()
export class ValuationRepository {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async create(
    userId: string,
    assetId: AssetId,
    input: CreateValuation,
    session: MongoSession
  ): Promise<Valuation> {
    const document = {
      userId,
      assetId: new Types.ObjectId(assetId),
      valueMinor: input.valueMinor,
      valuedAt: input.valuedAt,
      source: input.source,
      createdAt: new Date()
    };
    const result = await this.database()
      .collection(VALUATIONS_COLLECTION)
      .insertOne(document, { session });
    return this.toValuation({ _id: result.insertedId, ...document });
  }

  async listByAsset(userId: string, assetId: AssetId): Promise<Valuation[]> {
    const documents = await this.database()
      .collection(VALUATIONS_COLLECTION)
      .find({ userId, assetId: new Types.ObjectId(assetId) })
      .sort({ valuedAt: -1, _id: -1 })
      .toArray();
    return documents.map((document) => this.toValuation(document));
  }

  async findLatestForAssets(
    userId: string,
    assetIds: readonly AssetId[]
  ): Promise<Map<string, { valueMinor: number; valuedAt: Date }>> {
    if (assetIds.length === 0) return new Map();

    const documents = await this.database()
      .collection(VALUATIONS_COLLECTION)
      .aggregate([
        {
          $match: {
            userId,
            assetId: { $in: assetIds.map((assetId) => new Types.ObjectId(assetId)) }
          }
        },
        { $sort: { assetId: 1, valuedAt: -1, _id: -1 } },
        {
          $group: {
            _id: "$assetId",
            valueMinor: { $first: "$valueMinor" },
            valuedAt: { $first: "$valuedAt" }
          }
        }
      ])
      .toArray();

    const latest = new Map<string, { valueMinor: number; valuedAt: Date }>();
    for (const document of documents) {
      const parsed = LatestValuationSchema.parse(document);
      latest.set(objectIdString(parsed._id), {
        valueMinor: parsed.valueMinor,
        valuedAt: parsed.valuedAt
      });
    }
    return latest;
  }

  private toValuation(value: unknown): Valuation {
    const stored = StoredValuationSchema.parse(value);
    return ValuationSchema.parse({
      id: objectIdString(stored._id),
      userId: stored.userId,
      assetId: objectIdString(stored.assetId),
      valueMinor: stored.valueMinor,
      valuedAt: stored.valuedAt,
      source: stored.source,
      createdAt: stored.createdAt
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
