import { describe, expect, it, vi } from "vitest";

import { createMockConfig } from "../../test/mock-config.js";
import { StagedRowsCleanupCron } from "../staged-rows-cleanup.cron.js";

describe("StagedRowsCleanupCron Unit Tests", () => {
  it("run deletes expired staged rows on worker role", async () => {
    const mockDb = {
      delete: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: "row_1" }])
    };

    const mockConfig = createMockConfig("worker");
    const mockLogger = { log: vi.fn() };

    // @ts-expect-error mock db and logger
    const cron = new StagedRowsCleanupCron(mockDb, mockConfig, mockLogger);
    await cron.run();

    expect(mockDb.delete).toHaveBeenCalled();
    expect(mockLogger.log).toHaveBeenCalled();
  });
});
