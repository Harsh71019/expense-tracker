export function isUniqueViolation(error: unknown): boolean {
  return postgresErrorField(error, "code") === "23505";
}

export function isForeignKeyViolation(error: unknown): boolean {
  return postgresErrorField(error, "code") === "23503";
}

export function postgresConstraint(error: unknown): string | undefined {
  return postgresErrorField(error, "constraint");
}

function postgresErrorField(error: unknown, field: "code" | "constraint"): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  if (field === "code" && "code" in error && typeof error.code === "string") return error.code;
  if (field === "constraint" && "constraint" in error && typeof error.constraint === "string") {
    return error.constraint;
  }
  if ("cause" in error) return postgresErrorField(error.cause, field);
  return undefined;
}
