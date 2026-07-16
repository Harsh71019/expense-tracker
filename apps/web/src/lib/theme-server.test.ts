import { describe, expect, it, vi } from "vitest";

import { getStoredTheme } from "./theme-server";

const mocks = vi.hoisted((): { value: string | undefined } => ({ value: undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (mocks.value === undefined ? undefined : { value: mocks.value })
  })
}));

describe("getStoredTheme", () => {
  it.each([
    ["light", "light"],
    ["dark", "dark"],
    ["system", null],
    [undefined, null]
  ])("returns %s as %s", async (stored, expected) => {
    mocks.value = stored;
    await expect(getStoredTheme()).resolves.toBe(expected);
  });
});
