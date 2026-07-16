import { Inject, Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { Cron } from "@nestjs/schedule";
import type { Connection } from "mongoose";
import { Logger } from "nestjs-pino";

import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { LogEvent } from "../common/logging/events.js";
import { withTxn } from "../common/mongo-txn.js";
import { NotificationOutboxRepository } from "../notifications/notification-outbox.repository.js";
import { BalanceVerifyRepository } from "./balance-verify.repository.js";

type BalanceVerifyLogger = Pick<Logger, "log" | "error">;

/**
 * BACKEND.md §6 balances.verify (Sun 03:00 IST): "the self-auditing safety
 * net for the derived cache." No GlitchTip instance exists in this
 * deployment, so a drift is written to the notification_outbox (type
 * "balance_drift", already modeled for exactly this) and logged at error
 * level instead — both durable, both visible, neither requiring
 * infrastructure that doesn't exist yet. Worker-only guard mirrors every
 * other cron in this codebase.
 */
@Injectable()
export class BalanceVerifyService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly config: RuntimeConfigService,
    private readonly balances: BalanceVerifyRepository,
    private readonly outbox: NotificationOutboxRepository,
    @Inject(Logger) private readonly logger: BalanceVerifyLogger
  ) {}

  @Cron("0 3 * * 0", { timeZone: "Asia/Kolkata" })
  async verify(): Promise<void> {
    if (this.config.env.SERVICE_ROLE !== "worker") return;

    const [accounts, deltasByAccount] = await Promise.all([
      this.balances.findAllAccounts(),
      this.balances.sumDeltasByAccount()
    ]);

    let driftCount = 0;
    for (const account of accounts) {
      const expectedBalanceMinor =
        account.openingBalanceMinor + (deltasByAccount.get(account.id) ?? 0);
      if (expectedBalanceMinor === account.balanceMinor) continue;

      driftCount += 1;
      const driftMinor = account.balanceMinor - expectedBalanceMinor;
      await withTxn(this.connection, (session) =>
        this.outbox.enqueue(
          account.userId,
          "balance_drift",
          {
            accountId: account.id,
            accountName: account.name,
            expectedBalanceMinor,
            actualBalanceMinor: account.balanceMinor,
            driftMinor
          },
          session
        )
      );
      this.logger.error(
        {
          event: LogEvent.BalanceDriftDetected,
          accountId: account.id,
          userId: account.userId,
          expectedBalanceMinor,
          actualBalanceMinor: account.balanceMinor,
          driftMinor
        },
        "account balance drift detected"
      );
    }

    this.logger.log(
      { event: LogEvent.BalancesVerified, accountCount: accounts.length, driftCount },
      "balance verification complete"
    );
  }
}
