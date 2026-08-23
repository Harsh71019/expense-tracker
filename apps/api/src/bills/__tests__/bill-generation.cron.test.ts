import { describe, expect, it, vi } from "vitest";

import { focusedTestDouble } from "../../test/mock-drizzle.js";
import { BillGenerationCron } from "../bill-generation.cron.js";

function buildCron(dueCards: readonly { id: string }[]) {
  const accounts = { findDueCreditCards: vi.fn().mockResolvedValue(dueCards) };
  const config = { env: { SERVICE_ROLE: "worker" } };
  const ntfy = { notify: vi.fn().mockResolvedValue(undefined) };
  const logger = { log: vi.fn(), error: vi.fn() };
  const cron = new BillGenerationCron(
    focusedTestDouble({}),
    focusedTestDouble(config),
    focusedTestDouble(accounts),
    focusedTestDouble({}),
    focusedTestDouble({}),
    focusedTestDouble({}),
    focusedTestDouble(ntfy),
    focusedTestDouble(logger)
  );
  return { cron, ntfy };
}

describe("BillGenerationCron", () => {
  it("notifies success when every due card generates cleanly", async () => {
    const { cron, ntfy } = buildCron([{ id: "acc-1" }, { id: "acc-2" }]);
    vi.spyOn(cron, "generateOne").mockResolvedValue(undefined);

    await cron.generate();

    expect(ntfy.notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: "✅ bills.generate" })
    );
  });

  it("notifies a failure summary when some accounts fail", async () => {
    const { cron, ntfy } = buildCron([{ id: "acc-1" }, { id: "acc-2" }]);
    vi.spyOn(cron, "generateOne")
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("boom"));

    await cron.generate();

    expect(ntfy.notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: "❌ bills.generate had failures" })
    );
  });

  it("skips entirely outside the worker process", async () => {
    const accounts = { findDueCreditCards: vi.fn() };
    const cron = new BillGenerationCron(
      focusedTestDouble({}),
      focusedTestDouble({ env: { SERVICE_ROLE: "api" } }),
      focusedTestDouble(accounts),
      focusedTestDouble({}),
      focusedTestDouble({}),
      focusedTestDouble({}),
      focusedTestDouble({ notify: vi.fn() }),
      focusedTestDouble({ log: vi.fn(), error: vi.fn() })
    );

    await cron.generate();

    expect(accounts.findDueCreditCards).not.toHaveBeenCalled();
  });
});
