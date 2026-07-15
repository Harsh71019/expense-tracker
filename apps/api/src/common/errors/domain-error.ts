import type { ErrorCode } from "@vyaya/shared";

export abstract class DomainError extends Error {
  abstract readonly code: ErrorCode;
  abstract readonly status: number;
  abstract readonly retryable: boolean;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
