import { describe, expect, it, vi } from "vitest";

import { RedisService } from "../../redis/redis.service.js";
import { focusedTestDouble } from "../../../test/mock-drizzle.js";
import { MetricsService } from "../metrics.service.js";

describe("MetricsService", () => {
  it("renders low-cardinality HTTP, transaction, queue, heartbeat, and drift metrics", () => {
    const service = new MetricsService(
      focusedTestDouble<RedisService>({ get: vi.fn(), set: vi.fn() })
    );

    service.recordHttp("get", '/api/v1/accounts/"unsafe"', 200, 12.5);
    service.recordTransactionRetry();
    service.recordTransaction("committed", 20);
    service.recordTransaction("failed", 30);

    const output = service.render(
      [{ queue: "imports", counts: { waiting: 2, failed: 1 } }],
      15,
      { driftCount: 3, observedAt: "2026-07-28T00:00:00.000Z" },
      new Date("2026-07-28T00:01:00.000Z")
    );

    expect(output).toContain(
      'treasuryops_http_requests_total{method="GET",route="/api/v1/accounts/\\"unsafe\\"",status_code="200"} 1'
    );
    expect(output).toContain("treasuryops_db_transaction_retries_total 1");
    expect(output).toContain('treasuryops_db_transactions_total{outcome="committed"} 1');
    expect(output).toContain('treasuryops_db_transactions_total{outcome="failed"} 1');
    expect(output).toContain('treasuryops_queue_jobs{queue="imports",state="failed"} 1');
    expect(output).toContain("treasuryops_worker_heartbeat_age_seconds 15");
    expect(output).toContain("treasuryops_balance_drift_accounts 3");
    expect(output).toContain("treasuryops_balance_verification_age_seconds 60");
  });

  it("stores and validates the cross-process balance verification snapshot", async () => {
    const redis = {
      get: vi
        .fn()
        .mockResolvedValueOnce('{"driftCount":2,"observedAt":"2026-07-28T00:00:00.000Z"}')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('{"driftCount":"invalid","observedAt":"never"}'),
      set: vi.fn().mockResolvedValue(undefined)
    };
    const service = new MetricsService(focusedTestDouble<RedisService>(redis));

    await service.recordBalanceVerification(2, new Date("2026-07-28T00:00:00.000Z"));
    expect(redis.set).toHaveBeenCalledWith(
      "treasury-ops:metrics:balance-verification",
      '{"driftCount":2,"observedAt":"2026-07-28T00:00:00.000Z"}'
    );
    await expect(service.readBalanceVerification()).resolves.toEqual({
      driftCount: 2,
      observedAt: "2026-07-28T00:00:00.000Z"
    });
    await expect(service.readBalanceVerification()).resolves.toBeNull();
    await expect(service.readBalanceVerification()).rejects.toThrow();
  });

  it("uses -1 for missing cross-process signals", () => {
    const service = new MetricsService(
      focusedTestDouble<RedisService>({ get: vi.fn(), set: vi.fn() })
    );

    const output = service.render([], null, null);

    expect(output).toContain("treasuryops_worker_heartbeat_age_seconds -1");
    expect(output).toContain("treasuryops_balance_drift_accounts -1");
    expect(output).toContain("treasuryops_balance_verification_age_seconds -1");
  });
});
