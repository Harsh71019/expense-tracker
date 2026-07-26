import { describe, expect, it, vi } from "vitest";

import { LoggingNotificationAdapter } from "../logging-notification-adapter.js";

describe("LoggingNotificationAdapter", () => {
  it("logs routing metadata only, never the delivery payload", async () => {
    const log = vi.fn();
    const adapter = new LoggingNotificationAdapter({ log });

    await adapter.send({
      userId: "user-1",
      type: "budget_alert",
      payload: { budgetId: "budget-1", spentMinor: 450_000_00, limitMinor: 500_000_00 }
    });

    expect(log).toHaveBeenCalledTimes(1);
    const fields = log.mock.calls[0]?.[0];
    expect(fields).toMatchObject({ userId: "user-1", type: "budget_alert" });
    expect(fields.payload).toBeUndefined();
    expect(fields.spentMinor).toBeUndefined();
    expect(fields.limitMinor).toBeUndefined();
  });
});
