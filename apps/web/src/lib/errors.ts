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

export class NetworkError extends AppError {
  constructor(message: string, context: AppErrorContext = {}) {
    super(message, context);
    this.name = "NetworkError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, context: AppErrorContext = {}) {
    super(message, context);
    this.name = "ValidationError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string, context: AppErrorContext = {}) {
    super(message, context);
    this.name = "ConflictError";
  }
}
