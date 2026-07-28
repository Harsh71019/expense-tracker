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
   * Idempotent: a notification already marked "sent" (e.g. a duplicate
   * delivery job from an overlapping sweep tick) is a silent no-op, not a
   * re-delivery. A down/flaky adapter trips the circuit breaker rather than
   * hammering it — the thrown error propagates to the caller (the BullMQ
   * job), which is exactly what lets BullMQ's own attempts/backoff retry it.
   */
  async deliver(userId: string, notificationId: string): Promise<void> {
    const notification = await this.outbox.findById(userId, notificationId);
    if (
      notification === null ||
      notification.status === "sent" ||
      notification.failedAt !== undefined
    ) {
      return;
    }

    await this.breaker.execute(() =>
      this.adapter.send({
        userId: notification.userId,
        type: notification.type,
        payload: notification.payload
      })
    );
    await this.outbox.markSent(userId, notification.id);
  }

  async markTerminalFailure(
    userId: string,
    notificationId: string,
    attempts: number
  ): Promise<void> {
    await this.outbox.markTerminalFailure(userId, notificationId, attempts);
  }
}
