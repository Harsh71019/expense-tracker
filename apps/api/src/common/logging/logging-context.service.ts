import { Injectable } from "@nestjs/common";
import { AsyncLocalStorage } from "node:async_hooks";

export type LogContext = Readonly<{
  reqId: string;
  userId?: string;
  jobId?: string;
  jobName?: string;
  batchId?: string;
  txnId?: string;
  traceId?: string;
  apiKeyId?: string;
  apiKeyPrefix?: string;
}>;

@Injectable()
export class LoggingContextService {
  private readonly storage = new AsyncLocalStorage<LogContext>();

  run<T>(context: LogContext, operation: () => T): T {
    return this.storage.run(context, operation);
  }

  get(): LogContext | undefined {
    return this.storage.getStore();
  }

  set(values: Partial<LogContext>): void {
    const current = this.storage.getStore();
    if (current === undefined) {
      return;
    }

    this.storage.enterWith({ ...current, ...values });
  }
}
