import { Global, Module } from "@nestjs/common";

import { IdempotencyPostgresRepository } from "./idempotency-postgres.repository.js";
import { IdempotencyPostgresService } from "./idempotency-postgres.service.js";
import { IdempotencyRepository } from "./idempotency.repository.js";
import { IdempotencyService } from "./idempotency.service.js";

@Global()
@Module({
  providers: [
    IdempotencyRepository,
    IdempotencyService,
    IdempotencyPostgresRepository,
    IdempotencyPostgresService
  ],
  exports: [IdempotencyService, IdempotencyPostgresService]
})
export class IdempotencyModule {}
