import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createConnection } from "mongoose";
import type { Connection } from "mongoose";

import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { withTxn } from "../../../src/common/mongo-txn.js";

describe("AuditRepository", () => {
  let replicaSet: MongoMemoryReplSet | undefined;
  let connection: Connection | undefined;
  let auditRepository: AuditRepository | undefined;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    connection = await createConnection(replicaSet.getUri("vyaya_audit_test")).asPromise();
    auditRepository = new AuditRepository(connection);
  });

  afterAll(async () => {
    if (connection !== undefined) await connection.close();
    if (replicaSet !== undefined) await replicaSet.stop();
  });

  it("records audit logs inside a transaction and commits successfully", async () => {
    const repository = getAuditRepository(auditRepository);
    const conn = getConnection(connection);

    await withTxn(conn, async (session) => {
      await repository.record("user-1", "test.action", "507f1f77bcf86cd799439011", session);
    });

    const db = getDatabase(connection);
    const logs = await db.collection("audit_log").find({ userId: "user-1" }).toArray();
    expect(logs.length).toBe(1);
    expect(logs[0]).toMatchObject({
      userId: "user-1",
      action: "test.action",
      entityId: "507f1f77bcf86cd799439011"
    });
    expect(logs[0]?.at).toBeInstanceOf(Date);
  });

  it("rolls back audit log creation if the transaction aborts", async () => {
    const repository = getAuditRepository(auditRepository);
    const conn = getConnection(connection);

    await expect(
      withTxn(conn, async (session) => {
        await repository.record("user-1", "abort.action", "507f1f77bcf86cd799439012", session);
        throw new Error("Force Abort");
      })
    ).rejects.toThrow("Force Abort");

    const db = getDatabase(connection);
    const logs = await db.collection("audit_log").find({ action: "abort.action" }).toArray();
    expect(logs.length).toBe(0);
  });
});

function getAuditRepository(repository: AuditRepository | undefined): AuditRepository {
  if (repository === undefined) throw new Error("Audit repository is not ready");
  return repository;
}

function getConnection(connection: Connection | undefined): Connection {
  if (connection === undefined) throw new Error("Connection is not ready");
  return connection;
}

function getDatabase(connection: Connection | undefined): NonNullable<Connection["db"]> {
  const database = getConnection(connection).db;
  if (database === undefined) throw new Error("Database is not ready");
  return database;
}
