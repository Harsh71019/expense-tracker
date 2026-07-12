import { Injectable } from "@nestjs/common";
import { Logger } from "nestjs-pino";

import { LoggingContextService } from "./logging-context.service.js";

export type TransactionObserver = Readonly<{
  started(): void;
  retried(attempt: number): void;
  completed(durationMs: number): void;
  failed(error: unknown, durationMs: number): void;
}>;

let activeObserver: TransactionObserver | undefined;

export function transactionObserver(): TransactionObserver | undefined {
  return activeObserver;
}

@Injectable()
export class TransactionObserverService implements TransactionObserver {
  constructor(
    private readonly logger: Logger,
    private readonly context: LoggingContextService
  ) {
    activeObserver = {
      started: () => this.started(),
      retried: (attempt) => this.retried(attempt),
      completed: (durationMs) => this.completed(durationMs),
      failed: (error, durationMs) => this.failed(error, durationMs)
    };
  }

  started(): void {
    this.logger.debug({ event: "txn.started", ...this.context.get() }, "transaction started");
  }

  retried(attempt: number): void {
    this.logger.warn(
      { event: "txn.retry", attempt, ...this.context.get() },
      "transaction retrying"
    );
  }

  completed(durationMs: number): void {
    if (durationMs > 500) {
      this.logger.warn(
        { event: "txn.slow", durationMs, ...this.context.get() },
        "slow transaction"
      );
      return;
    }

    this.logger.debug(
      { event: "txn.committed", durationMs, ...this.context.get() },
      "transaction completed"
    );
  }

  failed(error: unknown, durationMs: number): void {
    this.logger.error(
      { event: "txn.failed", err: error, durationMs, ...this.context.get() },
      "transaction failed"
    );
  }
}
