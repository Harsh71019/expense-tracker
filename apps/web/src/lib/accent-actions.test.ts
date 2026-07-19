import { beforeEach, describe, expect, it, vi } from "vitest";

import { INITIAL_ACCENT_ACTION_STATE } from "./accent";
import { resetAccentPreference, saveCustomAccent, selectAccentPreset } from "./accent-actions";

const mocks = vi.hoisted(
  (): { set: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> } => ({
    set: vi.fn(),
    delete: vi.fn()
  })
);

vi.mock("next/headers", () => ({
  cookies: async () => ({ set: mocks.set, delete: mocks.delete })
}));

describe("accent actions", () => {
  beforeEach(() => {
    mocks.set.mockReset();
    mocks.delete.mockReset();
  });

  it("stores a validated preset", async () => {
    const formData = new FormData();
    formData.set("accent", "ocean");

    await selectAccentPreset(formData);

    expect(mocks.set).toHaveBeenCalledWith(
      "vyaya-accent",
      "preset:ocean",
      expect.objectContaining({ maxAge: 31_536_000, path: "/", sameSite: "lax" })
    );
  });

  it("ignores an invalid preset boundary value", async () => {
    const formData = new FormData();
    formData.set("accent", "red; path=/");

    await selectAccentPreset(formData);

    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("normalizes and stores a custom color", async () => {
    const formData = new FormData();
    formData.set("accentColor", "rgb(29, 78, 216)");

    await expect(saveCustomAccent(INITIAL_ACCENT_ACTION_STATE, formData)).resolves.toEqual({
      status: "success",
      message: "Applied custom accent #1d4ed8."
    });
    expect(mocks.set).toHaveBeenCalledWith(
      "vyaya-accent",
      "custom:1d4ed8",
      expect.objectContaining({ maxAge: 31_536_000, path: "/", sameSite: "lax" })
    );
  });

  it("rejects malformed custom input without changing the cookie", async () => {
    const formData = new FormData();
    formData.set("accentColor", "var(--expense)");

    const result = await saveCustomAccent(INITIAL_ACCENT_ACTION_STATE, formData);

    expect(result.status).toBe("error");
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("deletes the cookie for the default preset and reset action", async () => {
    const formData = new FormData();
    formData.set("accent", "default");

    await selectAccentPreset(formData);
    await resetAccentPreference();

    expect(mocks.delete).toHaveBeenCalledTimes(2);
    expect(mocks.delete).toHaveBeenCalledWith("vyaya-accent");
  });
});
