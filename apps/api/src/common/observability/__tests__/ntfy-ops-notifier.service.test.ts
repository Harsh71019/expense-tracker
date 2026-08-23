import { afterEach, describe, expect, it, vi } from "vitest";

import { focusedTestDouble } from "../../../test/mock-drizzle.js";
import { NtfyOpsNotifierService } from "../ntfy-ops-notifier.service.js";

describe("NtfyOpsNotifierService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does nothing when NTFY_URL/NTFY_TOPIC are unset", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const config = { env: {} };
    const logger = { error: vi.fn() };
    const service = new NtfyOpsNotifierService(
      focusedTestDouble(config),
      focusedTestDouble(logger)
    );

    await service.notify({ title: "hello", message: "world" });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts to the configured topic with title/priority/tags headers", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));
    const config = { env: { NTFY_URL: "http://ntfy.local", NTFY_TOPIC: "treasury_ops" } };
    const logger = { error: vi.fn() };
    const service = new NtfyOpsNotifierService(
      focusedTestDouble(config),
      focusedTestDouble(logger)
    );

    await service.notify({
      title: "✅ job",
      message: "done",
      priority: "high",
      tags: ["white_check_mark", "rotating_light"]
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://ntfy.local/treasury_ops",
      expect.objectContaining({
        method: "POST",
        body: "done",
        headers: {
          Title: "✅ job",
          Priority: "high",
          Tags: "white_check_mark,rotating_light"
        }
      })
    );
  });

  it("logs but does not throw when the push fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));
    const config = { env: { NTFY_URL: "http://ntfy.local", NTFY_TOPIC: "treasury_ops" } };
    const logger = { error: vi.fn() };
    const service = new NtfyOpsNotifierService(
      focusedTestDouble(config),
      focusedTestDouble(logger)
    );

    await expect(service.notify({ title: "x", message: "y" })).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "ntfy.push_failed", status: 500 }),
      "ntfy push failed"
    );
  });

  it("logs but does not throw when fetch itself rejects", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const config = { env: { NTFY_URL: "http://ntfy.local", NTFY_TOPIC: "treasury_ops" } };
    const logger = { error: vi.fn() };
    const service = new NtfyOpsNotifierService(
      focusedTestDouble(config),
      focusedTestDouble(logger)
    );

    await expect(service.notify({ title: "x", message: "y" })).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "ntfy.push_failed" }),
      "ntfy push failed"
    );
  });
});
