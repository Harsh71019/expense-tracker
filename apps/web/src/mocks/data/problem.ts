import type { ErrorCode } from "@vyaya/shared";

import type { components } from "@/lib/api/generated/schema";

type ProblemDetailsDto = components["schemas"]["ProblemDetails"];

/** Builds an RFC 7807 body matching `ProblemDetailsSchema`, for mock error responses. */
export function mockProblem(status: number, code: ErrorCode, detail: string): ProblemDetailsDto {
  return {
    type: "https://vyaya.dev/errors/mock",
    title: code,
    status,
    detail,
    instance: "urn:vyaya:mock",
    code,
    reqId: `mock-${Math.random().toString(36).slice(2, 10)}`,
    timestamp: new Date().toISOString(),
    retryable: status >= 500,
    errors: null
  };
}
