import { Global, Module } from "@nestjs/common";

import { IdempotencyPostgresRepository } from "./idempotency-postgres.repository.js";
import { IdempotencyPostgresService } from "./idempotency-postgres.service.js";

@Global()
@Module({
  providers: [IdempotencyPostgresRepository, IdempotencyPostgresService],
  exports: [IdempotencyPostgresService]
})
export class IdempotencyModule {}
