import { Inject, Injectable } from "@nestjs/common";
import { Logger } from "nestjs-pino";

import { RuntimeConfigService } from "../config/runtime-config.service.js";
import { LogEvent } from "../logging/events.js";

export type NtfyPriority = "min" | "low" | "default" | "high" | "urgent";

export interface NtfyNotification {
  title: string;
  message: string;
  priority?: NtfyPriority;
  tags?: readonly string[];
}

/**
 * Best-effort push to ntfy (running on the shared home-lab container) for
 * operational signals — cron run outcomes, process boot. Unlike
 * notifications/ (the outbox-backed, at-least-once domain-notification
 * pipeline), this is fire-and-forget: a dropped ops ping isn't worth
 * durability machinery, and there's no money-writing transaction to hang it
 * off of. A no-op when NTFY_URL/NTFY_TOPIC aren't configured.
 */
@Injectable()
export class NtfyOpsNotifierService {
  constructor(
    private readonly config: RuntimeConfigService,
    @Inject(Logger) private readonly logger: Pick<Logger, "error">
  ) {}

  async notify(notification: NtfyNotification): Promise<void> {
    const { NTFY_URL, NTFY_TOPIC } = this.config.env;
    if (NTFY_URL === undefined || NTFY_TOPIC === undefined) {
      return;
    }

    const headers: Record<string, string> = { Title: notification.title };
    if (notification.priority !== undefined) {
      headers.Priority = notification.priority;
    }
    if (notification.tags !== undefined && notification.tags.length > 0) {
      headers.Tags = notification.tags.join(",");
    }

    try {
      const response = await fetch(`${NTFY_URL}/${NTFY_TOPIC}`, {
        method: "POST",
        body: notification.message,
        headers
      });
      if (!response.ok) {
        this.logger.error(
          { event: LogEvent.NtfyPushFailed, status: response.status, title: notification.title },
          "ntfy push failed"
        );
      }
    } catch (error) {
      this.logger.error(
        { event: LogEvent.NtfyPushFailed, err: error, title: notification.title },
        "ntfy push failed"
      );
    }
  }
}
