import { Inject, Injectable } from "@nestjs/common";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { auditLog } from "../common/db/schema/index.js";
import type { DbTx } from "../common/db/db-txn.js";

@Injectable()
export class AuditRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async record(
    userId: string,
    action: string,
    entityId: string,
    tx: DbTx,
    meta?: Record<string, unknown>
  ): Promise<void> {
    await tx
      .insert(auditLog)
      .values({ userId, action, entityId, meta: meta ?? null, at: new Date() });
  }
}
