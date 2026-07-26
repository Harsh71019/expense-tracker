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
});
