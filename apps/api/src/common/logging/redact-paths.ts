export const PINO_REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.body.password",
  "req.body.description",
  "*.password",
  "*.secret",
  "*.token",
  "*.description"
] as const;
