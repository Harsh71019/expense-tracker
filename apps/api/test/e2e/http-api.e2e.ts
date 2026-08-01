import type { INestApplication } from "@nestjs/common";
import {
  AccountSchema,
  CreateApiKeyResponseSchema,
  ImportBatchSchema,
  ProblemDetailsSchema,
  TransactionInsightsSchema,
  TransactionSchema
} from "@treasury-ops/shared";
import { GenericContainer } from "testcontainers";
import type { StartedTestContainer } from "testcontainers";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { ImportBatchRepository } from "../../src/imports/import-batch.repository.js";
import { OpenApiController } from "../../src/openapi/openapi.controller.js";
import { assertLedgerInvariants } from "../integration/support/assert-ledger-invariants.js";
import { createTestDb } from "../integration/support/postgres-test-db.js";
import type { TestDb } from "../integration/support/postgres-test-db.js";

const PASSWORD = "correct-horse-battery-staple";
const JSON_HEADERS = { "content-type": "application/json" };
const SESSION_A_EMAIL = "e2e-a@example.com";
const SESSION_B_EMAIL = "e2e-b@example.com";

describe("production HTTP composition", () => {
  let app: INestApplication | undefined;
  let testDb: TestDb | undefined;
  let redis: StartedTestContainer | undefined;
  let baseUrl = "";
  let sessionA = "";
  let sessionB = "";

  beforeAll(async () => {
    testDb = await createTestDb();
    redis = await new GenericContainer("redis:8-alpine").withExposedPorts(6379).start();

    process.env.NODE_ENV = "test";
    process.env.API_PORT = "4000";
    process.env.LOG_LEVEL = "fatal";
    process.env.LOG_PRETTY = "false";
    process.env.SERVICE_ROLE = "api";
    process.env.DATABASE_URL = testDb.connectionUri;
    process.env.REDIS_URL = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
    process.env.TRUSTED_ORIGINS = "http://localhost:3000";
    process.env.GIT_SHA = "e2e";
    process.env.BETTER_AUTH_SECRET = "test-secret-long-enough-32-chars-long";
    process.env.BETTER_AUTH_URL = "http://127.0.0.1:4000";
    process.env.AUTH_COOKIE_SECURE = "false";
    process.env.DISABLE_SIGNUP = "false";
    process.env.DISABLE_RATE_LIMITING = "false";

    const { createHttpApp } = await import("../../src/http-app.js");
    app = await createHttpApp();
    await app.listen(0, "127.0.0.1");
    baseUrl = await app.getUrl();

    sessionA = await registerAndSignIn(baseUrl, SESSION_A_EMAIL, "E2E User A");
    sessionB = await registerAndSignIn(baseUrl, SESSION_B_EMAIL, "E2E User B");
  });

  afterEach(async () => {
    await assertLedgerInvariants(nonNullTestDb(testDb).db);
  });

  afterAll(async () => {
    if (app !== undefined) await app.close();
    if (redis !== undefined) await redis.stop();
    if (testDb !== undefined) await testDb.teardown();
  });

  it("serves liveness/readiness and maps unauthenticated failures to RFC 7807", async () => {
    const liveness = await fetch(`${baseUrl}/api/healthz`);
    expect(liveness.status).toBe(200);
    expect(await liveness.json()).toEqual({ status: "ok", sha: "e2e" });

    const readiness = await fetch(`${baseUrl}/api/readyz`);
    expect(readiness.status).toBe(200);
    expect(await readiness.json()).toEqual({ status: "ok", postgres: "ok", redis: "ok" });

    const unauthenticatedMetrics = await fetch(`${baseUrl}/api/v1/metrics`);
    expect(unauthenticatedMetrics.status).toBe(401);

    const unauthenticated = await fetch(`${baseUrl}/api/v1/accounts`);
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers.get("content-type")).toContain("application/problem+json");
    expect(await parseResponse(unauthenticated, ProblemDetailsSchema)).toMatchObject({
      status: 401,
      code: "auth.unauthenticated",
      retryable: false
    });

    const metrics = await fetch(`${baseUrl}/api/v1/metrics`, {
      headers: { cookie: sessionA }
    });
    expect(metrics.status).toBe(200);
    expect(metrics.headers.get("content-type")).toContain("text/plain");
    const metricsBody = await metrics.text();
    expect(metricsBody).toContain("treasuryops_queue_jobs");
    expect(metricsBody).toContain("treasuryops_worker_heartbeat_age_seconds");
    expect(metricsBody).toContain("treasuryops_balance_drift_accounts");
    expect(metricsBody).toContain('route="/api/v1/accounts"');
  });

  it("creates once, replays once, and naturally replays a reversal", async () => {
    const account = await createAccount(baseUrl, sessionA, "HTTP ledger");
    const transactionKey = crypto.randomUUID();
    const transactionBody = {
      accountId: account.id,
      type: "expense",
      amountMinor: 12_345,
      occurredAt: "2026-07-28T06:30:00.000Z",
      description: "E2E expense",
      tags: ["e2e"]
    };

    const createdResponse = await fetch(`${baseUrl}/api/v1/transactions`, {
      method: "POST",
      headers: {
        ...JSON_HEADERS,
        cookie: sessionA,
        "idempotency-key": transactionKey
      },
      body: JSON.stringify(transactionBody)
    });
    expect(createdResponse.status).toBe(201);
    const created = await parseResponse(createdResponse, TransactionSchema);
    expect(createdResponse.headers.get("location")).toBe(`/api/v1/transactions/${created.id}`);

    const replayResponse = await fetch(`${baseUrl}/api/v1/transactions`, {
      method: "POST",
      headers: {
        ...JSON_HEADERS,
        cookie: sessionA,
        "idempotency-key": transactionKey
      },
      body: JSON.stringify(transactionBody)
    });
    expect(replayResponse.status).toBe(200);
    expect(replayResponse.headers.get("idempotency-replayed")).toBe("true");
    expect((await parseResponse(replayResponse, TransactionSchema)).id).toBe(created.id);

    const reversedResponse = await fetch(`${baseUrl}/api/v1/transactions/${created.id}/reverse`, {
      method: "POST",
      headers: { cookie: sessionA }
    });
    expect(reversedResponse.status).toBe(200);
    const reversed = await parseResponse(reversedResponse, TransactionSchema);

    const reversalReplay = await fetch(`${baseUrl}/api/v1/transactions/${created.id}/reverse`, {
      method: "POST",
      headers: { cookie: sessionA }
    });
    expect(reversalReplay.status).toBe(200);
    expect(reversalReplay.headers.get("idempotency-replayed")).toBe("true");
    expect((await parseResponse(reversalReplay, TransactionSchema)).id).toBe(reversed.id);

    const insightsResponse = await fetch(`${baseUrl}/api/v1/transactions/insights`, {
      headers: { cookie: sessionA }
    });
    expect(insightsResponse.status).toBe(200);
    expect(
      (await parseResponse(insightsResponse, TransactionInsightsSchema)).lifetimeTransactionCount
    ).toBeGreaterThanOrEqual(2);
  });

  it("enforces API-key scopes and tenant ownership through the HTTP guard", async () => {
    const foreignAccount = await createAccount(baseUrl, sessionB, "User B private account");
    const crossTenant = await fetch(`${baseUrl}/api/v1/accounts/${foreignAccount.id}/archive`, {
      method: "PATCH",
      headers: { cookie: sessionA, "idempotency-key": crypto.randomUUID() }
    });
    expect(crossTenant.status).toBe(404);

    const keyResponse = await fetch(`${baseUrl}/api/v1/api-keys`, {
      method: "POST",
      headers: { ...JSON_HEADERS, cookie: sessionA },
      body: JSON.stringify({
        name: "read-only e2e",
        permissions: { accounts: ["read"] }
      })
    });
    expect(keyResponse.status).toBe(201);
    const apiKey = await parseResponse(keyResponse, CreateApiKeyResponseSchema);

    const allowed = await fetch(`${baseUrl}/api/v1/accounts`, {
      headers: { authorization: `Bearer ${apiKey.key}` }
    });
    expect(allowed.status).toBe(200);

    const denied = await fetch(`${baseUrl}/api/v1/transactions`, {
      method: "POST",
      headers: {
        ...JSON_HEADERS,
        authorization: `Bearer ${apiKey.key}`,
        "idempotency-key": crypto.randomUUID()
      },
      body: JSON.stringify({})
    });
    expect(denied.status).toBe(403);
    expect(await parseResponse(denied, ProblemDetailsSchema)).toMatchObject({
      code: "auth.insufficient_scope",
      status: 403
    });
  });

  it("accepts multipart CSV upload and durably records the parse workflow", async () => {
    const account = await createAccount(baseUrl, sessionA, "CSV account");
    const form = new FormData();
    form.set(
      "file",
      new Blob(["Date,Description,Amount\n28/07/2026,Coffee,-250.00\n"], {
        type: "text/csv"
      }),
      "statement.csv"
    );
    form.set("accountId", account.id);
    form.set(
      "mapping",
      JSON.stringify({
        date: "Date",
        description: "Description",
        dateFormat: "DD/MM/YYYY",
        amountConvention: "single_signed",
        amount: "Amount"
      })
    );

    const response = await fetch(`${baseUrl}/api/v1/imports`, {
      method: "POST",
      headers: { cookie: sessionA },
      body: form
    });
    expect(response.status).toBe(202);
    const batch = await parseResponse(response, ImportBatchSchema);
    expect(batch.status).toBe("pending_parse");
    expect(response.headers.get("location")).toBe(`/api/v1/imports/${batch.id}`);
    const requestId = response.headers.get("x-request-id");
    expect(requestId).toBeTruthy();

    const payload = await nonNullApp(app)
      .get(ImportBatchRepository)
      .findWorkflowPayload(batch.userId, batch.id);
    expect(payload).toMatchObject({
      accountId: account.id,
      fileContentBase64: expect.any(String)
    });
  });

  it("automatically probes every secured OpenAPI operation for an auth boundary", async () => {
    const spec = new OpenApiController().getSpec();
    const securedOperations = Object.entries(spec.paths ?? {}).flatMap(([path, pathItem]) =>
      Object.entries(pathItem)
        .filter(([method, operation]) => isHttpMethod(method) && hasSecurity(operation))
        .map(([method]) => ({ method, path }))
    );
    expect(securedOperations.length).toBeGreaterThan(30);

    for (const operation of securedOperations) {
      const method = operation.method.toUpperCase();
      const response = await fetch(`${baseUrl}/api${materializePath(operation.path)}`, {
        method,
        headers: JSON_HEADERS,
        ...(method === "GET" || method === "HEAD" ? {} : { body: "{}" })
      });
      expect(
        response.status,
        `${operation.method.toUpperCase()} ${operation.path} bypassed authentication`
      ).toBe(401);
    }
  });
});

async function registerAndSignIn(baseUrl: string, email: string, name: string): Promise<string> {
  const signup = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ name, email, password: PASSWORD, rememberMe: false })
  });
  if (!signup.ok) {
    throw new Error(`Sign-up failed with ${signup.status}: ${await signup.text()}`);
  }

  const signin = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ email, password: PASSWORD, rememberMe: false })
  });
  if (!signin.ok) {
    throw new Error(`Sign-in failed with ${signin.status}: ${await signin.text()}`);
  }

  const cookies = signin.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .filter((value): value is string => value !== undefined);
  if (cookies.length === 0) throw new Error("Sign-in response did not set a session cookie.");
  return cookies.join("; ");
}

async function createAccount(
  baseUrl: string,
  cookie: string,
  name: string
): Promise<z.infer<typeof AccountSchema>> {
  const response = await fetch(`${baseUrl}/api/v1/accounts`, {
    method: "POST",
    headers: {
      ...JSON_HEADERS,
      cookie,
      "idempotency-key": crypto.randomUUID()
    },
    body: JSON.stringify({ name, type: "bank", openingBalanceMinor: 100_000 })
  });
  if (response.status !== 201) {
    throw new Error(`Account creation failed with ${response.status}: ${await response.text()}`);
  }
  return parseResponse(response, AccountSchema);
}

async function parseResponse<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const value: unknown = await response.json();
  return schema.parse(value);
}

function hasSecurity(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "security" in value &&
    Array.isArray(value.security) &&
    value.security.length > 0
  );
}

function isHttpMethod(value: string): boolean {
  return ["get", "post", "put", "patch", "delete", "options", "head"].includes(value);
}

function materializePath(path: string): string {
  return path.replaceAll(/\{[^}]+\}/g, "00000000-0000-4000-8000-000000000000");
}

function nonNullApp(app: INestApplication | undefined): INestApplication {
  if (app === undefined) throw new Error("HTTP app is not ready.");
  return app;
}

function nonNullTestDb(testDb: TestDb | undefined): TestDb {
  if (testDb === undefined) throw new Error("Test database is not ready.");
  return testDb;
}
