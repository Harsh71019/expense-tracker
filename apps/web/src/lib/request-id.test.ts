import { describe, expect, it } from "vitest";

import { generateRequestId } from "./request-id";

describe("generateRequestId", () => {
  it("generates unique UUID request identifiers", () => {
    const first = generateRequestId();
    const second = generateRequestId();

    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(second).not.toBe(first);
  });
});
