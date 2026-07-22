import { beforeEach, describe, expect, it, vi } from "vitest";

import { applyThemePreference, toggleTheme } from "./theme-actions";

const mocks = vi.hoisted(
  (): {
    current: "light" | "dark" | null;
    set: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  } => ({
    current: "light",
    set: vi.fn(),
    delete: vi.fn()
  })
);

vi.mock("next/headers", () => ({
  cookies: async () => ({ set: mocks.set, delete: mocks.delete })
}));

vi.mock("./theme-server", () => ({ getStoredTheme: async () => mocks.current }));

describe("toggleTheme", () => {
  beforeEach(() => {
    mocks.set.mockReset();
    mocks.delete.mockReset();
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
      "treasury-ops-theme",
      expected,
      expect.objectContaining({ maxAge: 31_536_000, path: "/", sameSite: "lax" })
    );
  });

  it("stores an explicit settings-page theme", async () => {
    const formData = new FormData();
    formData.set("theme", "dark");

    await applyThemePreference(formData);

    expect(mocks.set).toHaveBeenCalledWith(
      "treasury-ops-theme",
      "dark",
      expect.objectContaining({ maxAge: 31_536_000, path: "/", sameSite: "lax" })
    );
  });

  it("deletes the theme cookie for the system preference", async () => {
    const formData = new FormData();
    formData.set("theme", "system");

    await applyThemePreference(formData);

    expect(mocks.delete).toHaveBeenCalledWith("treasury-ops-theme");
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("ignores an invalid theme preference", async () => {
    const formData = new FormData();
    formData.set("theme", "sepia");

    await applyThemePreference(formData);

    expect(mocks.delete).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });
});
