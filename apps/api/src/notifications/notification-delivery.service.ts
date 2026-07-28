import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";

import { CircuitBreaker } from "./circuit-breaker.js";
import { NOTIFICATION_ADAPTER } from "./notification-adapter.js";
import type { NotificationAdapter } from "./notification-adapter.js";
import { NotificationOutboxRepository } from "./notification-outbox.repository.js";

@Injectable()
export class NotificationDeliveryService {
  private readonly breaker = new CircuitBreaker();

  constructor(
    private readonly outbox: NotificationOutboxRepository,
    @Inject(NOTIFICATION_ADAPTER) private readonly adapter: NotificationAdapter
  ) {}

  /**
   * Claims before sending, so duplicate Bull jobs are silent no-ops while a
   * live claim exists. Adapter failures release the row for BullMQ/sweep
   * retry; acknowledgement failures deliberately leave the lease intact so
   * the send/ack gap recovers only after expiry with the same adapter key.
   */
  async deliver(userId: string, notificationId: string): Promise<void> {
    const claimToken = randomUUID();
    const now = new Date();
    const notification = await this.outbox.claimForDelivery(
      userId,
      notificationId,
      claimToken,
      now,
      new Date(now.getTime() + 10 * 60_000)
    );
    if (notification === null) return;

    try {
      await this.breaker.execute(() =>
        this.adapter.send({
          idempotencyKey: notification.id,
          userId: notification.userId,
          type: notification.type,
          payload: notification.payload
        })
      );
    } catch (error) {
      await this.outbox.releaseFailed(userId, notification.id, claimToken, errorSummary(error));
      throw error;
    }

    if (!(await this.outbox.markSent(userId, notification.id, claimToken))) {
      throw new Error("Notification delivery acknowledgement lost its database claim.");
    }
  }

  async markTerminalFailure(
    userId: string,
    notificationId: string,
    attempts: number
  ): Promise<void> {
    await this.outbox.markTerminalFailure(userId, notificationId, attempts);
  }
}

function errorSummary(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown notification adapter failure";
}
