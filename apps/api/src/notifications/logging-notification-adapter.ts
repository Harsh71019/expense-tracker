import { Inject, Injectable } from "@nestjs/common";
import { Logger } from "nestjs-pino";

import type { NotificationAdapter, NotificationDelivery } from "./notification-adapter.js";

type DeliveryLogger = Pick<Logger, "log">;

/**
 * Default NotificationAdapter binding: logs what would have been sent
 * instead of calling a real ntfy/Telegram endpoint. Swapping in a real
 * adapter is a one-line change in notifications.module.ts's provider once
 * a server URL / bot token exists — nothing else in the pipeline changes.
 */
@Injectable()
export class LoggingNotificationAdapter implements NotificationAdapter {
  constructor(@Inject(Logger) private readonly logger: DeliveryLogger) {}

  async send(delivery: NotificationDelivery): Promise<void> {
    this.logger.log(
      { event: "notification.delivery_stub", ...delivery },
      "no real notification adapter configured — logging instead of delivering"
    );
    return Promise.resolve();
  }
}
