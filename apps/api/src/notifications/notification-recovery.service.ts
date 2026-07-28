import { Injectable } from "@nestjs/common";

import { NotificationOutboxRepository } from "./notification-outbox.repository.js";
import { NotificationsQueue } from "./notifications.queue.js";

@Injectable()
export class NotificationRecoveryService {
  constructor(
    private readonly outbox: NotificationOutboxRepository,
    private readonly queue: NotificationsQueue
  ) {}

  async requeue(userId: string, notificationId: string): Promise<boolean> {
    const reset = await this.outbox.requeueTerminalFailure(userId, notificationId);
    if (!reset) return false;
    await this.queue.replaceTerminalDelivery(userId, notificationId);
    return true;
  }
}
