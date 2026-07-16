import { beforeEach, describe, expect, it, vi } from "vitest";

import { toggleTheme } from "./theme-actions";

const mocks = vi.hoisted(
  (): { current: "light" | "dark" | null; set: ReturnType<typeof vi.fn> } => ({
    current: "light",
    set: vi.fn()
  })
);

vi.mock("next/headers", () => ({
  cookies: async () => ({ set: mocks.set })
}));

vi.mock("./theme-server", () => ({ getStoredTheme: async () => mocks.current }));

describe("toggleTheme", () => {
  beforeEach(() => {
    mocks.set.mockReset();
  });

  const transitions = [
    ["light", "dark"],
    ["dark", "light"],
    [null, "light"]
  ] as const;

  it.each(transitions)("stores %s after toggling from %s", async (current, expected) => {
    mocks.current = current;

    await toggleTheme();

    expect(mocks.set).toHaveBeenCalledWith(
      "vyaya-theme",
      expected,
      expect.objectContaining({ maxAge: 31_536_000, path: "/", sameSite: "lax" })
    );
  });
});
