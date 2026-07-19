import { describe, expect, it, vi } from "vitest";

import { getStoredAccent } from "./accent-server";

const mocks = vi.hoisted((): { value: string | undefined } => ({ value: undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (mocks.value === undefined ? undefined : { value: mocks.value })
  })
}));

describe("getStoredAccent", () => {
  it.each([
    [undefined, { kind: "default" }],
    ["preset:amber", { kind: "preset", preset: "amber" }],
    ["custom:1d4ed8", { kind: "custom", color: "#1d4ed8" }],
    ["custom:<style>", { kind: "default" }]
  ])("returns a safe preference for %s", async (stored, expected) => {
    mocks.value = stored;
    await expect(getStoredAccent()).resolves.toEqual(expected);
  });
});
