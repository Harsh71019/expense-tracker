import { Injectable } from "@nestjs/common";
import {
  DismissSpendingWarningResponseSchema,
  type DismissSpendingWarningResponse
} from "@treasury-ops/shared";

import { IdempotencyPostgresService } from "../common/idempotency/idempotency-postgres.service.js";
import type { IdempotentResult } from "../common/idempotency/idempotency-postgres.service.js";
import { SpendingWarningsService } from "./spending-warnings.service.js";

@Injectable()
export class SpendingWarningsMutationService {
  constructor(
    private readonly warnings: SpendingWarningsService,
    private readonly idempotency: IdempotencyPostgresService
  ) {}

  dismiss(
    userId: string,
    warningId: string,
    key: string
  ): Promise<IdempotentResult<DismissSpendingWarningResponse>> {
    return this.idempotency.execute(
      userId,
      "spending_warning.dismiss",
      key,
      { warningId },
      DismissSpendingWarningResponseSchema,
      (tx) => this.warnings.dismissInTx(userId, warningId, tx)
    );
  }
}
