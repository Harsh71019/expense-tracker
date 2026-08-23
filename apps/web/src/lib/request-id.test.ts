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

  it("generates an RFC 4122 version 4 UUID using getRandomValues when randomUUID is unavailable", () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis.crypto, "randomUUID");
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      value: undefined,
      configurable: true,
      writable: true
    });

    try {
      vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation((array) => {
        if (array === null) {
          return array;
        }
        new Uint8Array(array.buffer, array.byteOffset, array.byteLength).fill(0xff);
        return array;
      });

      expect(generateRequestId()).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
    } finally {
      if (originalDescriptor !== undefined) {
        Object.defineProperty(globalThis.crypto, "randomUUID", originalDescriptor);
      }
    }
  });

  it("generates a valid UUIDv4 when crypto is completely unavailable", () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    Object.defineProperty(globalThis, "crypto", {
      value: undefined,
      configurable: true,
      writable: true
    });

    try {
      const id = generateRequestId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    } finally {
      if (originalDescriptor !== undefined) {
        Object.defineProperty(globalThis, "crypto", originalDescriptor);
      }
    }
  });
});
