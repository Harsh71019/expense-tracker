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

  /**
   * Logs routing metadata only (userId, type) -- never the payload. Some
   * payloads carry financial figures (budget_alert's spentMinor/limitMinor,
   * goal_achieved's targetMinor); spreading them into logs would leak money
   * data into a place with looser retention/access controls than the DB.
   */
  async send(delivery: NotificationDelivery): Promise<void> {
    this.logger.log(
      { event: "notification.delivery_stub", userId: delivery.userId, type: delivery.type },
      "no real notification adapter configured — logging instead of delivering"
    );
    return Promise.resolve();
  }
}
