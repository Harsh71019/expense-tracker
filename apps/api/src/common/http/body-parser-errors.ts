function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isExpressMalformedJson(exception: unknown): boolean {
  return (
    exception instanceof SyntaxError &&
    isRecord(exception) &&
    exception.type === "entity.parse.failed"
  );
}

export function isExpressPayloadTooLarge(exception: unknown): boolean {
  return isRecord(exception) && exception.type === "entity.too.large";
}

export function isMulterFileTooLarge(exception: unknown): boolean {
  return (
    isRecord(exception) && exception.name === "MulterError" && exception.code === "LIMIT_FILE_SIZE"
  );
}
