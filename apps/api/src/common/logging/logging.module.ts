import { Global, Module } from "@nestjs/common";
import type { MiddlewareConsumer, NestModule } from "@nestjs/common";

import { LoggingContextService } from "./logging-context.service.js";
import { RequestContextMiddleware } from "./request-context.middleware.js";
import { TransactionObserverService } from "./transaction-observer.service.js";

@Global()
@Module({
  providers: [LoggingContextService, RequestContextMiddleware, TransactionObserverService],
  exports: [LoggingContextService]
})
export class LoggingModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes("*");
  }
}
