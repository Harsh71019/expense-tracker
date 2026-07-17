import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createConnection } from "mongoose";
import type { Connection } from "mongoose";
import { z } from "zod";

import { IdempotencyRepository } from "../../../src/common/idempotency/idempotency.repository.js";
import { IdempotencyService } from "../../../src/common/idempotency/idempotency.service.js";

const ResultSchema = z.object({ id: z.string(), value: z.number().int() });

describe("IdempotencyService", () => {
  let replicaSet: MongoMemoryReplSet | undefined;
  let connection: Connection | undefined;
  let service: IdempotencyService | undefined;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    connection = await createConnection(replicaSet.getUri("vyaya_idempotency_test")).asPromise();
    const repository = new IdempotencyRepository(connection);
    service = new IdempotencyService(repository);
    await database(connection)
      .collection("idempotency_records")
      .createIndex(
        { userId: 1, operation: 1, key: 1 },
        { unique: true, name: "idempotency_records_user_operation_key_unique" }
      );
  });

  afterAll(async () => {
    if (connection !== undefined) await connection.close();
    if (replicaSet !== undefined) await replicaSet.stop();
  });

  it("stores the first result and replays the authoritative stored value", async () => {
    const first = await idempotency(service).execute(
      connected(connection),
      "user-a",
      "test.first",
      "11111111-1111-4111-8111-111111111111",
      ResultSchema,
      async (session) => {
        await database(connection).collection("effects").insertOne({ value: 1 }, { session });
        return { id: "first", value: 1 };
      }
    );
    const replay = await idempotency(service).execute(
      connected(connection),
      "user-a",
      "test.first",
      "11111111-1111-4111-8111-111111111111",
      ResultSchema,
      async () => ({ id: "wrong", value: 2 })
    );

    expect(first).toEqual({ result: { id: "first", value: 1 }, replayed: false });
    expect(replay).toEqual({ result: { id: "first", value: 1 }, replayed: true });
    expect(await database(connection).collection("effects").countDocuments()).toBe(1);
  });

  it("allows five concurrent attempts to commit exactly one effect", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        idempotency(service).execute(
          connected(connection),
          "user-a",
          "test.concurrent",
          "22222222-2222-4222-8222-222222222222",
          ResultSchema,
          async (session) => {
            await database(connection)
              .collection("concurrent_effects")
              .insertOne({ value: 1 }, { session });
            return { id: "concurrent", value: 1 };
          }
        )
      )
    );

    expect(results.filter((result) => !result.replayed)).toHaveLength(1);
    expect(new Set(results.map((result) => result.result.id))).toEqual(new Set(["concurrent"]));
    expect(await database(connection).collection("concurrent_effects").countDocuments()).toBe(1);
  });

  it("rolls back the effect and does not store a replay record when work fails", async () => {
    await expect(
      idempotency(service).execute(
        connected(connection),
        "user-a",
        "test.rollback",
        "33333333-3333-4333-8333-333333333333",
        ResultSchema,
        async (session) => {
          await database(connection)
            .collection("rollback_effects")
            .insertOne({ value: 1 }, { session });
          throw new Error("work failed");
        }
      )
    ).rejects.toThrow("work failed");

    expect(await database(connection).collection("rollback_effects").countDocuments()).toBe(0);
    expect(
      await database(connection)
        .collection("idempotency_records")
        .countDocuments({ operation: "test.rollback" })
    ).toBe(0);
  });
});

function idempotency(value: IdempotencyService | undefined): IdempotencyService {
  if (value === undefined) throw new Error("Idempotency service is not ready");
  return value;
}

function connected(value: Connection | undefined): Connection {
  if (value === undefined) throw new Error("MongoDB connection is not ready");
  return value;
}

function database(value: Connection | undefined): NonNullable<Connection["db"]> {
  const db = connected(value).db;
  if (db === undefined) throw new Error("MongoDB database is not ready");
  return db;
}
