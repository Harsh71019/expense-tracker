import { ProblemDetailsSchema } from "@treasury-ops/shared";

import {
  AppError,
  AuthError,
  ConflictError,
  NetworkError,
  PermissionError,
  ValidationError
} from "../errors";

export function toAppError(error: unknown, status: number): AppError {
  const parsed = ProblemDetailsSchema.safeParse(error);
  const message = parsed.success ? parsed.data.message : "The request could not be completed.";
  const context = parsed.success
    ? { reqId: parsed.data.reqId, status, problemType: parsed.data.code }
    : { status };

  if (status === 401) {
    return new AuthError(message, context);
  }
  if (status === 403) {
    return new PermissionError(message, context);
  }
  if (status === 409) {
    return new ConflictError(message, context);
  }
  if (status === 422) {
    return new ValidationError(message, context, parsed.success ? (parsed.data.errors ?? []) : []);
  }
  if (status >= 500) {
    return new NetworkError(message, context);
  }
  return new AppError(message, context);
}

export function toNetworkError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  return new NetworkError("We could not reach TreasuryOps. Check your connection and try again.");
}
