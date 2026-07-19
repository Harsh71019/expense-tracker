import { Global, Module } from "@nestjs/common";
import type { Provider } from "@nestjs/common";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { RuntimeConfigModule } from "../config/runtime-config.module.js";
import { RuntimeConfigService } from "../config/runtime-config.service.js";
import * as authSchema from "./auth-schema.js";
import * as schema from "./schema/index.js";

const fullSchema = { ...schema, ...authSchema };

export type DrizzleDb = NodePgDatabase<typeof fullSchema>;

export const DATABASE_CONNECTION = Symbol("DATABASE_CONNECTION");

const databaseProvider: Provider = {
  provide: DATABASE_CONNECTION,
  inject: [RuntimeConfigService],
  useFactory: (config: RuntimeConfigService): DrizzleDb => {
    const pool = new Pool({ connectionString: config.env.DATABASE_URL, max: 10 });
    return drizzle(pool, { schema: fullSchema });
  }
};

@Global()
@Module({
  imports: [RuntimeConfigModule],
  providers: [databaseProvider],
  exports: [databaseProvider]
})
export class DbModule {}
