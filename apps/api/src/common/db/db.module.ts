import { Global, Module } from "@nestjs/common";
import type { Provider } from "@nestjs/common";

import { RuntimeConfigModule } from "../config/runtime-config.module.js";
import { DatabaseClient } from "./database-client.service.js";
import type { DrizzleDb } from "./database-client.service.js";

export type { DrizzleDb } from "./database-client.service.js";

export const DATABASE_CONNECTION = Symbol("DATABASE_CONNECTION");

const databaseProvider: Provider = {
  provide: DATABASE_CONNECTION,
  inject: [DatabaseClient],
  useFactory: (client: DatabaseClient): DrizzleDb => client.db
};

@Global()
@Module({
  imports: [RuntimeConfigModule],
  providers: [DatabaseClient, databaseProvider],
  exports: [DatabaseClient, databaseProvider]
})
export class DbModule {}
