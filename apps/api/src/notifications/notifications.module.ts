import { Global, Module } from "@nestjs/common";

import { NotificationOutboxRepository } from "./notification-outbox.repository.js";
import { NotificationsQueue } from "./notifications.queue.js";
import { NotificationDeliveryService } from "./notification-delivery.service.js";
import { NotificationSweepService } from "./notification-sweep.service.js";
import { NOTIFICATION_ADAPTER } from "./notification-adapter.js";
import { LoggingNotificationAdapter } from "./logging-notification-adapter.js";

/**
 * @Global(): budgets/recurring/goals (Phase 4) will call
 * NotificationOutboxRepository.enqueue(...) from inside their own
 * transactions without importing this module directly, mirroring AuditModule.
 */
@Global()
@Module({
  providers: [
    NotificationOutboxRepository,
    NotificationsQueue,
    NotificationDeliveryService,
    NotificationSweepService,
    { provide: NOTIFICATION_ADAPTER, useClass: LoggingNotificationAdapter }
  ],
  exports: [NotificationOutboxRepository, NotificationsQueue, NotificationDeliveryService]
})
export class NotificationsModule {}
