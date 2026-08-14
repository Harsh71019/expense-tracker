import { describe, expect, it } from "vitest";

import { createMockDrizzleDb } from "../../test/mock-drizzle.js";
import { AuditRepository } from "../audit.repository.js";

describe("AuditRepository Unit Tests", () => {
  it("record inserts audit log row", async () => {
    const mockDb = createMockDrizzleDb([{ id: "audit_1" }]);
    const repo = new AuditRepository(mockDb);

    await repo.record(
      "u1",
      "transaction.create",
      "tx_123",
      // @ts-expect-error mock tx
      mockDb,
      { amount: 100 }
    );
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it("recordMany inserts one audit batch and skips empty input", async () => {
    const mockDb = createMockDrizzleDb();
    const repo = new AuditRepository(mockDb);

    await repo.recordMany(
      "u1",
      "transaction.update",
      [{ entityId: "tx_1", meta: { batch: true } }, { entityId: "tx_2" }],
      // @ts-expect-error mock tx
      mockDb
    );
    await repo.recordMany(
      "u1",
      "transaction.update",
      [],
      // @ts-expect-error mock tx
      mockDb
    );

    expect(mockDb.insert).toHaveBeenCalledOnce();
    expect(mockDb.values).toHaveBeenCalledWith([
      expect.objectContaining({ userId: "u1", entityId: "tx_1", meta: { batch: true } }),
      expect.objectContaining({ userId: "u1", entityId: "tx_2", meta: null })
    ]);
  });
});
