import { afterEach, describe, expect, it, vi } from "vitest";

import { generateRequestId } from "./request-id";

describe("generateRequestId", () => {
  afterEach(() => vi.restoreAllMocks());

  it("generates unique UUID request identifiers", () => {
    const first = generateRequestId();
    const second = generateRequestId();

    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(second).not.toBe(first);
  });

  it("generates an RFC 4122 version 4 UUID without crypto.randomUUID", () => {
    vi.spyOn(crypto, "getRandomValues").mockImplementation((array) => {
      if (array === null) {
        return array;
      }
      new Uint8Array(array.buffer, array.byteOffset, array.byteLength).fill(0xff);
      return array;
    });

    expect(generateRequestId()).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
  });
});
