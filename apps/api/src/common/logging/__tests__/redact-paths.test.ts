import { describe, expect, it } from "vitest";

import { PINO_REDACT_PATHS } from "../redact-paths.js";

describe("PINO_REDACT_PATHS", () => {
  it("redacts recommendation descriptions as well as secrets", () => {
    expect(PINO_REDACT_PATHS).toContain("req.body.description");
    expect(PINO_REDACT_PATHS).toContain("*.description");
    expect(PINO_REDACT_PATHS).toContain("req.body.password");
  });
});
