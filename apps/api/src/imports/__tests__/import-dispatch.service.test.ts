import { describe, expect, it, vi } from "vitest";

import { focusedTestDouble } from "../../test/mock-drizzle.js";
import { ImportDispatchService } from "../import-dispatch.service.js";

const CLAIM = {
  batchId: "123e4567-e89b-42d3-a456-426614174000",
  userId: "user-1",
  operation: "parse" as const,
  claimToken: "00000000-0000-4000-8000-000000000000",
  correlationId: "request-1"
};

function createDispatcher(role: "api" | "worker") {
  const tx = {};
  const db = {
    transaction: vi.fn(async (work: (value: object) => Promise<unknown>) => work(tx))
  };
  const batches = {
    systemClaimReady: vi.fn().mockResolvedValue([CLAIM]),
    releaseWorkflowClaim: vi.fn().mockResolvedValue(undefined)
  };
  const queue = { enqueueWorkflow: vi.fn().mockResolvedValue(undefined) };
  const logger = { log: vi.fn(), error: vi.fn() };
  const service = new ImportDispatchService(
    focusedTestDouble(db),
    focusedTestDouble({ env: { SERVICE_ROLE: role } }),
    focusedTestDouble(batches),
    focusedTestDouble(queue),
    focusedTestDouble(logger)
  );
  return { service, db, batches, queue, logger };
}

describe("ImportDispatchService", () => {
  it("never performs system discovery in the API process", async () => {
    const { service, db, batches, queue } = createDispatcher("api");

    await service.dispatchReady();

    expect(db.transaction).not.toHaveBeenCalled();
    expect(batches.systemClaimReady).not.toHaveBeenCalled();
    expect(queue.enqueueWorkflow).not.toHaveBeenCalled();
  });

  it("claims durable commands before enqueueing their pointers", async () => {
    const { service, batches, queue } = createDispatcher("worker");

    await service.dispatchReady();

    expect(batches.systemClaimReady).toHaveBeenCalledWith(
      expect.any(Date),
      expect.any(Date),
      50,
      expect.any(Object)
    );
    expect(queue.enqueueWorkflow).toHaveBeenCalledWith(CLAIM);
  });

  it("releases a claim for a later retry when Redis is unavailable", async () => {
    const { service, batches, queue, logger } = createDispatcher("worker");
    queue.enqueueWorkflow.mockRejectedValueOnce(new Error("Redis unavailable"));

    await service.dispatchReady();

    expect(batches.releaseWorkflowClaim).toHaveBeenCalledWith(
      CLAIM.userId,
      CLAIM.batchId,
      CLAIM.claimToken,
      expect.any(Date)
    );
    expect(logger.error).toHaveBeenCalled();
  });
});
