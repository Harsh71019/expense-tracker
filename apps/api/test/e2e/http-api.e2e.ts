import type { INestApplication } from "@nestjs/common";
import {
  AccountSchema,
  BatchCategorizeTransactionsResultSchema,
  CategorySchema,
  CreditCardPaymentResultSchema,
  CreateApiKeyResponseSchema,
  FinancialProfileSchema,
  FinancialProfileStateSchema,
  ImportBatchSchema,
  PendingTransactionSchema,
  ProblemDetailsSchema,
  ReviewInboxPageSchema,
  ReviewInboxSummarySchema,
  SalaryStatisticsSchema,
  SalaryVersionPageSchema,
  SalaryVersionSchema,
  TransactionInsightsSchema,
  TransactionSchema,
  GoalFeasibilityReportSchema,
  SafetyBufferPreferenceSchema,
  SafetyBufferStateSchema,
  SafetyBufferVersionPageSchema
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
      description: "UPI/DR/TEST MERCHANT/test.merchant@okhdfcbank",
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
    expect(created).toMatchObject({
      paymentRail: "upi",
      counterpartyHandle: "test.merchant@okhdfcbank"
    });
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
    expect(reversed.paymentRail).toBe("upi");

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

  it("assigns one category to a selected transaction batch and replays safely", async () => {
    const account = await createAccount(baseUrl, sessionA, "HTTP batch category");
    const categoryResponse = await fetch(`${baseUrl}/api/v1/categories`, {
      method: "POST",
      headers: {
        ...JSON_HEADERS,
        cookie: sessionA,
        "idempotency-key": crypto.randomUUID()
      },
      body: JSON.stringify({ name: "Batch dining", kind: "expense" })
    });
    expect(categoryResponse.status).toBe(201);
    const category = await parseResponse(categoryResponse, CategorySchema);
    const created = await Promise.all(
      ["Batch lunch", "Batch dinner"].map(async (description, index) => {
        const response = await fetch(`${baseUrl}/api/v1/transactions`, {
          method: "POST",
          headers: {
            ...JSON_HEADERS,
            cookie: sessionA,
            "idempotency-key": crypto.randomUUID()
          },
          body: JSON.stringify({
            accountId: account.id,
            type: "expense",
            amountMinor: 1_000 + index,
            occurredAt: `2026-08-0${index + 1}T06:30:00.000Z`,
            description,
            tags: []
          })
        });
        expect(response.status).toBe(201);
        return parseResponse(response, TransactionSchema);
      })
    );
    const body = {
      transactionIds: created.map((transaction) => transaction.id),
      categoryId: category.id
    };
    const key = crypto.randomUUID();

    const assignedResponse = await fetch(`${baseUrl}/api/v1/transactions`, {
      method: "PATCH",
      headers: { ...JSON_HEADERS, cookie: sessionA, "idempotency-key": key },
      body: JSON.stringify(body)
    });
    expect(assignedResponse.status).toBe(200);
    expect(await parseResponse(assignedResponse, BatchCategorizeTransactionsResultSchema)).toEqual({
      ...body,
      updatedCount: 2
    });

    const replayResponse = await fetch(`${baseUrl}/api/v1/transactions`, {
      method: "PATCH",
      headers: { ...JSON_HEADERS, cookie: sessionA, "idempotency-key": key },
      body: JSON.stringify(body)
    });
    expect(replayResponse.status).toBe(200);
    expect(replayResponse.headers.get("idempotency-replayed")).toBe("true");

    for (const transaction of created) {
      const response = await fetch(`${baseUrl}/api/v1/transactions/${transaction.id}`, {
        headers: { cookie: sessionA }
      });
      expect(await parseResponse(response, TransactionSchema)).toMatchObject({
        categoryId: category.id
      });
    }
  });

  it("links an existing debit to a credit card without debiting the bank twice", async () => {
    const bank = await createAccount(baseUrl, sessionA, "CRED source bank");
    const card = await createAccount(baseUrl, sessionA, "CRED target card", "credit_card", -50_000);
    const transactionResponse = await fetch(`${baseUrl}/api/v1/transactions`, {
      method: "POST",
      headers: {
        ...JSON_HEADERS,
        cookie: sessionA,
        "idempotency-key": crypto.randomUUID()
      },
      body: JSON.stringify({
        accountId: bank.id,
        type: "expense",
        amountMinor: 19_990,
        occurredAt: "2026-08-12T06:30:00.000Z",
        description: "CRED credit card bill payment",
        tags: []
      })
    });
    expect(transactionResponse.status).toBe(201);
    const source = await parseResponse(transactionResponse, TransactionSchema);
    const key = crypto.randomUUID();
    const paymentBody = {
      transactionId: source.id,
      creditCardAccountId: card.id
    };

    const paymentResponse = await fetch(`${baseUrl}/api/v1/credit-card-payments`, {
      method: "POST",
      headers: { ...JSON_HEADERS, cookie: sessionA, "idempotency-key": key },
      body: JSON.stringify(paymentBody)
    });
    expect(paymentResponse.status).toBe(200);
    const payment = await parseResponse(paymentResponse, CreditCardPaymentResultSchema);
    expect(payment.transfer.fromTransaction.id).toBe(source.id);
    expect(payment.transfer.toTransaction).toMatchObject({
      accountId: card.id,
      type: "income",
      amountMinor: 19_990
    });

    const replayResponse = await fetch(`${baseUrl}/api/v1/credit-card-payments`, {
      method: "POST",
      headers: { ...JSON_HEADERS, cookie: sessionA, "idempotency-key": key },
      body: JSON.stringify(paymentBody)
    });
    expect(replayResponse.status).toBe(200);
    expect(replayResponse.headers.get("idempotency-replayed")).toBe("true");
    expect(
      (await parseResponse(replayResponse, CreditCardPaymentResultSchema)).transfer.transferGroupId
    ).toBe(payment.transfer.transferGroupId);

    const accountsResponse = await fetch(`${baseUrl}/api/v1/accounts`, {
      headers: { cookie: sessionA }
    });
    const accountList = await parseResponse(accountsResponse, z.array(AccountSchema));
    expect(accountList.find((account) => account.id === bank.id)?.balanceMinor).toBe(80_010);
    expect(accountList.find((account) => account.id === card.id)?.balanceMinor).toBe(-30_010);
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
      headers: { ...JSON_HEADERS, cookie: sessionA, "idempotency-key": crypto.randomUUID() },
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

  it("lets a transactions:write API key create pending transactions, but never confirm them", async () => {
    const account = await createAccount(baseUrl, sessionA, "Pending transactions account");
    const keyResponse = await fetch(`${baseUrl}/api/v1/api-keys`, {
      method: "POST",
      headers: { ...JSON_HEADERS, cookie: sessionA, "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({
        name: "n8n e2e",
        permissions: { transactions: ["write"] }
      })
    });
    expect(keyResponse.status).toBe(201);
    const apiKey = await parseResponse(keyResponse, CreateApiKeyResponseSchema);

    const created = await fetch(`${baseUrl}/api/v1/pending-transactions`, {
      method: "POST",
      headers: {
        ...JSON_HEADERS,
        authorization: `Bearer ${apiKey.key}`,
        "idempotency-key": crypto.randomUUID()
      },
      body: JSON.stringify({
        accountId: account.id,
        type: "expense",
        occurredAt: new Date().toISOString(),
        description: "Anthropic — USD 23.60, INR amount pending"
      })
    });
    expect(created.status).toBe(201);
    const pendingTransaction = await parseResponse(created, PendingTransactionSchema);

    const deniedConfirm = await fetch(
      `${baseUrl}/api/v1/pending-transactions/${pendingTransaction.id}/confirm`,
      {
        method: "POST",
        headers: {
          ...JSON_HEADERS,
          authorization: `Bearer ${apiKey.key}`,
          "idempotency-key": crypto.randomUUID()
        },
        body: JSON.stringify({ amountMinor: 199_900 })
      }
    );
    expect(deniedConfirm.status).toBe(403);
    expect(await parseResponse(deniedConfirm, ProblemDetailsSchema)).toMatchObject({
      code: "auth.insufficient_scope",
      status: 403
    });

    const confirmed = await fetch(
      `${baseUrl}/api/v1/pending-transactions/${pendingTransaction.id}/confirm`,
      {
        method: "POST",
        headers: { ...JSON_HEADERS, cookie: sessionA, "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ amountMinor: 199_900 })
      }
    );
    expect(confirmed.status).toBe(200);
    expect((await parseResponse(confirmed, PendingTransactionSchema)).status).toBe("confirmed");
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

  it("stores salary and work facts, derives statistics, and keeps history append-only", async () => {
    const setupState = await parseResponse(
      await fetch(`${baseUrl}/api/v1/financial-profile`, { headers: { cookie: sessionA } }),
      FinancialProfileStateSchema
    );
    expect(setupState).toMatchObject({
      configured: false,
      profile: null,
      currentSalaryVersion: null,
      suggestedMonthlyWorkMinutes: 9_600
    });

    const notConfigured = await fetch(`${baseUrl}/api/v1/financial-profile/salary-statistics`, {
      headers: { cookie: sessionA }
    });
    expect(notConfigured.status).toBe(422);
    expect(await parseResponse(notConfigured, ProblemDetailsSchema)).toMatchObject({
      code: "financial_profile.not_configured",
      status: 422
    });

    const profileKey = crypto.randomUUID();
    const profileBody = {
      monthlyWorkMinutes: 9_600,
      incomeStability: "stable",
      salaryCreditDay: 1
    };
    const savedProfile = await fetch(`${baseUrl}/api/v1/financial-profile`, {
      method: "PATCH",
      headers: { ...JSON_HEADERS, cookie: sessionA, "idempotency-key": profileKey },
      body: JSON.stringify(profileBody)
    });
    expect(savedProfile.status).toBe(200);
    expect(await parseResponse(savedProfile, FinancialProfileSchema)).toMatchObject({
      monthlyWorkMinutes: 9_600,
      salaryCreditDay: 1,
      expectedAnnualIncrementBps: null,
      incomeStability: "stable"
    });

    const profileReplay = await fetch(`${baseUrl}/api/v1/financial-profile`, {
      method: "PATCH",
      headers: { ...JSON_HEADERS, cookie: sessionA, "idempotency-key": profileKey },
      body: JSON.stringify(profileBody)
    });
    expect(profileReplay.headers.get("idempotency-replayed")).toBe("true");

    const salaryKey = crypto.randomUUID();
    const salaryBody = {
      netMonthlySalaryMinor: 12_50_000,
      annualCtcMinor: 2_40_00_000,
      effectiveFrom: "2026-04-01T00:00:00.000Z"
    };
    const createdSalary = await fetch(`${baseUrl}/api/v1/financial-profile/salary-versions`, {
      method: "POST",
      headers: { ...JSON_HEADERS, cookie: sessionA, "idempotency-key": salaryKey },
      body: JSON.stringify(salaryBody)
    });
    expect(createdSalary.status).toBe(201);
    const salary = await parseResponse(createdSalary, SalaryVersionSchema);
    expect(salary.source).toBe("manually_confirmed");

    const salaryReplay = await fetch(`${baseUrl}/api/v1/financial-profile/salary-versions`, {
      method: "POST",
      headers: { ...JSON_HEADERS, cookie: sessionA, "idempotency-key": salaryKey },
      body: JSON.stringify(salaryBody)
    });
    expect(salaryReplay.status).toBe(200);
    expect(salaryReplay.headers.get("idempotency-replayed")).toBe("true");
    expect((await parseResponse(salaryReplay, SalaryVersionSchema)).id).toBe(salary.id);

    const duplicateDate = await fetch(`${baseUrl}/api/v1/financial-profile/salary-versions`, {
      method: "POST",
      headers: { ...JSON_HEADERS, cookie: sessionA, "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ ...salaryBody, netMonthlySalaryMinor: 13_00_000 })
    });
    expect(duplicateDate.status).toBe(409);
    expect(await parseResponse(duplicateDate, ProblemDetailsSchema)).toMatchObject({
      code: "financial_profile.duplicate_effective_date",
      status: 409
    });

    const futureSalary = await fetch(`${baseUrl}/api/v1/financial-profile/salary-versions`, {
      method: "POST",
      headers: { ...JSON_HEADERS, cookie: sessionA, "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({
        netMonthlySalaryMinor: 20_00_000,
        effectiveFrom: "2099-01-01T00:00:00.000Z"
      })
    });
    expect(futureSalary.status).toBe(201);

    const statistics = await parseResponse(
      await fetch(
        `${baseUrl}/api/v1/financial-profile/salary-statistics?asOf=2026-08-16T00:00:00.000Z`,
        { headers: { cookie: sessionA } }
      ),
      SalaryStatisticsSchema
    );
    expect(statistics).toMatchObject({
      currentNetMonthlySalaryMinor: 12_50_000,
      annualizedNetIncomeMinor: 1_50_00_000,
      netHourlyWageMinor: 7_813,
      eightHourWorkdayEquivalentMinor: 62_500,
      salaryVersionId: salary.id,
      formulaVersion: 1
    });

    const history = await parseResponse(
      await fetch(`${baseUrl}/api/v1/financial-profile/salary-versions?limit=1`, {
        headers: { cookie: sessionA }
      }),
      SalaryVersionPageSchema
    );
    expect(history.items).toHaveLength(1);
    expect(history.items[0]?.netMonthlySalaryMinor).toBe(20_00_000);
    expect(history.pageInfo.hasMore).toBe(true);

    const nextCursor = history.pageInfo.nextCursor;
    if (nextCursor === null) throw new Error("Expected a salary history cursor.");
    const secondPage = await parseResponse(
      await fetch(
        `${baseUrl}/api/v1/financial-profile/salary-versions?limit=1&cursor=${encodeURIComponent(nextCursor)}`,
        { headers: { cookie: sessionA } }
      ),
      SalaryVersionPageSchema
    );
    expect(secondPage.items[0]?.id).toBe(salary.id);
    expect(secondPage.items[0]?.netMonthlySalaryMinor).toBe(12_50_000);

    const invalidSalary = await fetch(`${baseUrl}/api/v1/financial-profile/salary-versions`, {
      method: "POST",
      headers: { ...JSON_HEADERS, cookie: sessionA, "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ netMonthlySalaryMinor: 0, effectiveFrom: "2027-04-01T00:00:00.000Z" })
    });
    expect(invalidSalary.status).toBe(422);
    expect(await parseResponse(invalidSalary, ProblemDetailsSchema)).toMatchObject({
      code: "common.validation_failed"
    });
  });

  it("never leaks one user's salary profile or history to another", async () => {
    const foreignState = await parseResponse(
      await fetch(`${baseUrl}/api/v1/financial-profile`, { headers: { cookie: sessionB } }),
      FinancialProfileStateSchema
    );
    expect(foreignState.configured).toBe(false);
    expect(foreignState.currentSalaryVersion).toBeNull();

    const foreignHistory = await parseResponse(
      await fetch(`${baseUrl}/api/v1/financial-profile/salary-versions`, {
        headers: { cookie: sessionB }
      }),
      SalaryVersionPageSchema
    );
    expect(foreignHistory.items).toHaveLength(0);

    const foreignStatistics = await fetch(`${baseUrl}/api/v1/financial-profile/salary-statistics`, {
      headers: { cookie: sessionB }
    });
    expect(foreignStatistics.status).toBe(422);

    for (const path of [
      "/api/v1/financial-profile",
      "/api/v1/financial-profile/salary-versions",
      "/api/v1/financial-profile/salary-statistics"
    ]) {
      const unauthenticated = await fetch(`${baseUrl}${path}`);
      expect(unauthenticated.status).toBe(401);
    }
  });

  it("serves review inbox and summary endpoints with tenancy boundaries", async () => {
    const syncRes = await fetch(`${baseUrl}/api/v1/review-inbox/sync`, {
      method: "POST",
      headers: { cookie: sessionA }
    });
    expect(syncRes.status).toBe(200);
    const syncJson = await syncRes.json();
    expect(syncJson).toHaveProperty("syncedCount");

    const inboxPage = await parseResponse(
      await fetch(`${baseUrl}/api/v1/review-inbox`, { headers: { cookie: sessionA } }),
      ReviewInboxPageSchema
    );
    expect(inboxPage.items).toBeDefined();

    const summary = await parseResponse(
      await fetch(`${baseUrl}/api/v1/review-inbox/summary`, { headers: { cookie: sessionA } }),
      ReviewInboxSummarySchema
    );
    expect(summary.activeCount).toBeGreaterThanOrEqual(0);

    for (const path of ["/api/v1/review-inbox", "/api/v1/review-inbox/summary"]) {
      const unauthenticated = await fetch(`${baseUrl}${path}`);
      expect(unauthenticated.status).toBe(401);
    }
  });

  it("serves safety buffer and goal feasibility endpoints with tenancy boundaries", async () => {
    // 1. Get initial safety buffer state (fallback)
    const initialState = await parseResponse(
      await fetch(`${baseUrl}/api/v1/safety-buffer`, { headers: { cookie: sessionA } }),
      SafetyBufferStateSchema
    );
    expect(initialState.isFallback).toBe(true);

    // 2. Create a safety buffer version
    const createdPref = await parseResponse(
      await fetch(`${baseUrl}/api/v1/safety-buffer`, {
        method: "POST",
        headers: {
          ...JSON_HEADERS,
          cookie: sessionA,
          "idempotency-key": crypto.randomUUID()
        },
        body: JSON.stringify({
          mode: "fixed_amount",
          amountMinor: 5_000_000
        })
      }),
      SafetyBufferPreferenceSchema
    );
    expect(createdPref.version).toBe(1);

    // 3. List safety buffer versions
    const versions = await parseResponse(
      await fetch(`${baseUrl}/api/v1/safety-buffer/versions`, { headers: { cookie: sessionA } }),
      SafetyBufferVersionPageSchema
    );
    expect(versions.items).toHaveLength(1);

    // 4. Get goal feasibility report
    const feasibility = await parseResponse(
      await fetch(`${baseUrl}/api/v1/goals/feasibility`, { headers: { cookie: sessionA } }),
      GoalFeasibilityReportSchema
    );
    expect(feasibility.scenarios).toHaveLength(3);

    // Tenant isolation: sessionB should see fallback and 0 versions
    const foreignState = await parseResponse(
      await fetch(`${baseUrl}/api/v1/safety-buffer`, { headers: { cookie: sessionB } }),
      SafetyBufferStateSchema
    );
    expect(foreignState.isFallback).toBe(true);

    const foreignVersions = await parseResponse(
      await fetch(`${baseUrl}/api/v1/safety-buffer/versions`, { headers: { cookie: sessionB } }),
      SafetyBufferVersionPageSchema
    );
    expect(foreignVersions.items).toHaveLength(0);

    for (const path of [
      "/api/v1/safety-buffer",
      "/api/v1/safety-buffer/versions",
      "/api/v1/goals/feasibility"
    ]) {
      const unauthenticated = await fetch(`${baseUrl}${path}`);
      expect(unauthenticated.status).toBe(401);
    }
  });

  it("automatically probes every secured OpenAPI operation for an auth boundary", async () => {
    const spec = new OpenApiController().getSpec();
    const securedOperations = Object.entries(spec.paths ?? {}).flatMap(([path, pathItem]) =>
      Object.entries(pathItem)
        .filter(([method, operation]) => isHttpMethod(method) && hasSecurity(operation))
        .map(([method]) => ({ method, path }))
    );
    expect(securedOperations.length).toBeGreaterThan(30);
    expect(securedOperations).toEqual(
      expect.arrayContaining([
        { method: "get", path: "/v1/financial-profile" },
        { method: "patch", path: "/v1/financial-profile" },
        { method: "get", path: "/v1/financial-profile/salary-versions" },
        { method: "post", path: "/v1/financial-profile/salary-versions" },
        { method: "get", path: "/v1/financial-profile/salary-statistics" }
      ])
    );

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
  name: string,
  type: z.infer<typeof AccountSchema>["type"] = "bank",
  openingBalanceMinor = 100_000
): Promise<z.infer<typeof AccountSchema>> {
  const response = await fetch(`${baseUrl}/api/v1/accounts`, {
    method: "POST",
    headers: {
      ...JSON_HEADERS,
      cookie,
      "idempotency-key": crypto.randomUUID()
    },
    body: JSON.stringify({ name, type, openingBalanceMinor })
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
