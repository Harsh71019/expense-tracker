import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DbModule } from "../common/db/db.module.js";
import { IdempotencyModule } from "../common/idempotency/idempotency.module.js";
import { ReviewInboxController } from "./review-inbox.controller.js";
import { ReviewInboxMutationService } from "./review-inbox-mutation.service.js";
import { ReviewInboxRepository } from "./review-inbox.repository.js";
import { ReviewInboxService } from "./review-inbox.service.js";

@Module({
  imports: [DbModule, AuthModule, IdempotencyModule],
  controllers: [ReviewInboxController],
  providers: [ReviewInboxRepository, ReviewInboxService, ReviewInboxMutationService],
  exports: [ReviewInboxRepository, ReviewInboxService, ReviewInboxMutationService]
})
export class ReviewInboxModule {}
