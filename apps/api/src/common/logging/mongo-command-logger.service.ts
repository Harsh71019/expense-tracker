import { Injectable, type OnModuleInit } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import type { Connection } from "mongoose";
import { Logger } from "nestjs-pino";

import { LoggingContextService } from "./logging-context.service.js";

@Injectable()
export class MongoCommandLoggerService implements OnModuleInit {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly logger: Logger,
    private readonly context: LoggingContextService
  ) {}

  onModuleInit(): void {
    this.connection.getClient().on("commandSucceeded", (event) => {
      const fields = {
        event: event.duration > 100 ? "mongo.slow" : "mongo.command",
        command: event.commandName,
        database: event.databaseName,
        durationMs: event.duration,
        ...this.context.get()
      };
      if (event.duration > 100) {
        this.logger.warn(fields, "slow MongoDB command");
        return;
      }

      this.logger.debug(fields, "MongoDB command completed");
    });
  }
}
