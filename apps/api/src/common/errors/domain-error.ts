import type { ErrorCode } from "@treasury-ops/shared";

export abstract class DomainError extends Error {
  abstract readonly code: ErrorCode;
  abstract readonly status: number;
  abstract readonly retryable: boolean;
  readonly headers?: Readonly<Record<string, string>>;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
