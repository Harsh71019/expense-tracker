import { CreateSafetyBufferPreferenceSchema } from "@treasury-ops/shared";
import type { HttpHandler } from "msw";

import { generateRequestId } from "@/lib/request-id";

import type { MockHttp } from "./types";

export function safetyBufferHandlers(http: MockHttp): HttpHandler[] {
  return [
    http.get("/v1/safety-buffer", ({ response }) => {
      return response(200).json({
        preference: {
          id: "33333333-3333-4333-8333-333333333333",
          userId: "mock-user",
          version: 1,
          mode: "essential_months",
          amountMinor: null,
          months: 3,
          emergencyFundGoalId: null,
          effectiveFrom: "2026-01-01T00:00:00.000Z",
          createdAt: "2026-01-01T00:00:00.000Z"
        },
        targetMinor: 15_000_000,
        liquidBalanceMinor: 20_000_000,
        bufferSurplusMinor: 5_000_000,
        bufferGapMinor: 0,
        isFallback: false,
        fallbackPolicy: null,
        monthlyEssentialOutflowMinor: 5_000_000
      });
    }),

    http.post("/v1/safety-buffer", async ({ request, response }) => {
      const raw = await request.json();
      const body = CreateSafetyBufferPreferenceSchema.parse(raw);

      return response(201).json({
        id: generateRequestId(),
        userId: "mock-user",
        version: 2,
        mode: body.mode,
        amountMinor: body.amountMinor ?? null,
        months: body.months ?? null,
        emergencyFundGoalId: body.emergencyFundGoalId ?? null,
        effectiveFrom: body.effectiveFrom
          ? body.effectiveFrom.toISOString()
          : new Date().toISOString(),
        createdAt: new Date().toISOString()
      });
    }),

    http.get("/v1/safety-buffer/versions", ({ response }) => {
      return response(200).json({
        items: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            userId: "mock-user",
            version: 1,
            mode: "essential_months",
            amountMinor: null,
            months: 3,
            emergencyFundGoalId: null,
            effectiveFrom: "2026-01-01T00:00:00.000Z",
            createdAt: "2026-01-01T00:00:00.000Z"
          }
        ],
        pageInfo: {
          nextCursor: null,
          hasMore: false,
          limit: 50
        }
      });
    })
  ];
}
