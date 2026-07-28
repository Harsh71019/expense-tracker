export type NotificationDelivery = Readonly<{
  /**
   * Stable across every retry of one outbox entry. Adapters with native
   * deduplication must pass this value through to the provider.
   */
  idempotencyKey: string;
  userId: string;
  type: string;
  payload: Readonly<Record<string, unknown>>;
}>;

/**
 * The actual outbound channel (ntfy/Telegram) — behind an interface so the
 * real adapter is a drop-in once credentials exist, same "isolated call
 * site" shape as suggestCategory in category-rules/. No ntfy/Telegram
 * server exists in this deployment yet; LoggingNotificationAdapter is the
 * default binding until one does.
 */
export interface NotificationAdapter {
  /**
   * Delivery is at-least-once. Adapters backed by a provider that supports
   * deduplication must forward delivery.idempotencyKey. Adapters without
   * that capability may duplicate a message if the process dies after the
   * provider accepts it but before Postgres records the acknowledgement.
   */
  send(delivery: NotificationDelivery): Promise<void>;
}

export const NOTIFICATION_ADAPTER = Symbol("NOTIFICATION_ADAPTER");
