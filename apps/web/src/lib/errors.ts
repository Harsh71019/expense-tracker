export type AppErrorContext = Readonly<{
  reqId?: string;
  method?: string;
  route?: string;
  status?: number;
  problemType?: string;
}>;

export class AppError extends Error {
  readonly context: AppErrorContext;

  constructor(message: string, context: AppErrorContext = {}) {
    super(message);
    this.name = "AppError";
    this.context = context;
  }
}

export class AuthError extends AppError {
  constructor(message: string, context: AppErrorContext = {}) {
    super(message, context);
    this.name = "AuthError";
  }
}

export class PermissionError extends AppError {
  constructor(message: string, context: AppErrorContext = {}) {
    super(message, context);
    this.name = "PermissionError";
  }
}

export class NetworkError extends AppError {
  constructor(message: string, context: AppErrorContext = {}) {
    super(message, context);
    this.name = "NetworkError";
  }
}

export class ValidationError extends AppError {
  readonly fields: readonly ProblemFieldError[];

  constructor(
    message: string,
    context: AppErrorContext = {},
    fields: readonly ProblemFieldError[] = []
  ) {
    super(message, context);
    this.name = "ValidationError";
    this.fields = fields;
  }
}

export class ConflictError extends AppError {
  constructor(message: string, context: AppErrorContext = {}) {
    super(message, context);
    this.name = "ConflictError";
  }
}

export function userErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ValidationError) {
    return error.fields[0]?.message ?? error.message;
  }
  if (error instanceof AuthError) {
    return "Your session has expired. Sign in again to continue.";
  }
  if (error instanceof PermissionError) {
    return "You do not have permission to complete this action.";
  }
  if (error instanceof NetworkError) {
    return error.context.status === undefined
      ? "We could not reach TreasuryOps. Check your connection and try again."
      : "TreasuryOps is temporarily unavailable. Try again in a moment.";
  }
  if (error instanceof AppError && error.message.trim() !== "") {
    return error.message;
  }
  return fallback;
}
import type { ProblemFieldError } from "@treasury-ops/shared";
