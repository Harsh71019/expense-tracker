import { Injectable } from "@nestjs/common";
import type { OnModuleDestroy } from "@nestjs/common";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { RuntimeConfigService } from "../config/runtime-config.service.js";
import * as authSchema from "./auth-schema.js";
import * as schema from "./schema/index.js";

const fullSchema = { ...schema, ...authSchema };

export type DrizzleDb = NodePgDatabase<typeof fullSchema>;

@Injectable()
export class DatabaseClient implements OnModuleDestroy {
  private readonly pool: Pool;
  readonly db: DrizzleDb;

  constructor(config: RuntimeConfigService) {
    const env = config.env;
    this.pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: env.DATABASE_POOL_MAX,
      connectionTimeoutMillis: env.DATABASE_CONNECTION_TIMEOUT_MS,
      query_timeout: env.DATABASE_QUERY_TIMEOUT_MS,
      statement_timeout: env.DATABASE_STATEMENT_TIMEOUT_MS,
      lock_timeout: env.DATABASE_LOCK_TIMEOUT_MS,
      idle_in_transaction_session_timeout: env.DATABASE_IDLE_IN_TXN_TIMEOUT_MS
    });
    this.db = drizzle(this.pool, { schema: fullSchema });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
