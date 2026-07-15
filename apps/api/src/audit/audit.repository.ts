import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import type { Connection } from "mongoose";

import type { MongoSession } from "../common/mongo-txn.js";

const AUDIT_LOG_COLLECTION = "audit_log";

@Injectable()
export class AuditRepository {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async record(
    userId: string,
    action: string,
    entityId: string,
    session: MongoSession,
    meta?: Record<string, unknown>
  ): Promise<void> {
    const metaField = meta === undefined ? {} : { meta };
    await this.database()
      .collection(AUDIT_LOG_COLLECTION)
      .insertOne({ userId, action, entityId, ...metaField, at: new Date() }, { session });
  }

  private database(): NonNullable<Connection["db"]> {
    const database = this.connection.db;
    if (database === undefined) throw new Error("MongoDB connection is not ready");
    return database;
  }
}
