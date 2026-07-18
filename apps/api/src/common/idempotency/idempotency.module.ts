import { Global, Module } from "@nestjs/common";

import { IdempotencyRepository } from "./idempotency.repository.js";
import { IdempotencyService } from "./idempotency.service.js";

@Global()
@Module({ providers: [IdempotencyRepository, IdempotencyService], exports: [IdempotencyService] })
export class IdempotencyModule {}
