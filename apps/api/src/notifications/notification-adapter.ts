export type NotificationDelivery = Readonly<{
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
  send(delivery: NotificationDelivery): Promise<void>;
}

export const NOTIFICATION_ADAPTER = Symbol("NOTIFICATION_ADAPTER");
