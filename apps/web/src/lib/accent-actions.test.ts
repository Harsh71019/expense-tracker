import { beforeEach, describe, expect, it, vi } from "vitest";

import { INITIAL_ACCENT_ACTION_STATE } from "./accent";
import { applyAccentPreference, resetAccentPreference } from "./accent-actions";

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
    formData.set("accentSelection", "ocean");

    await expect(applyAccentPreference(INITIAL_ACCENT_ACTION_STATE, formData)).resolves.toEqual({
      status: "success",
      message: "Applied preset.",
      appliedKey: "preset:ocean"
    });

    expect(mocks.set).toHaveBeenCalledWith(
      "treasury-ops-accent",
      "preset:ocean",
      expect.objectContaining({ maxAge: 31_536_000, path: "/", sameSite: "lax" })
    );
  });

  it("ignores an invalid preset boundary value", async () => {
    const formData = new FormData();
    formData.set("accentSelection", "red; path=/");

    await expect(applyAccentPreference(INITIAL_ACCENT_ACTION_STATE, formData)).resolves.toEqual({
      status: "error",
      message: "Choose a valid accent color.",
      appliedKey: null
    });

    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("normalizes and stores a custom color", async () => {
    const formData = new FormData();
    formData.set("accentSelection", "custom");
    formData.set("accentColor", "rgb(29, 78, 216)");

    await expect(applyAccentPreference(INITIAL_ACCENT_ACTION_STATE, formData)).resolves.toEqual({
      status: "success",
      message: "Applied custom accent #1d4ed8.",
      appliedKey: "custom:1d4ed8"
    });
    expect(mocks.set).toHaveBeenCalledWith(
      "treasury-ops-accent",
      "custom:1d4ed8",
      expect.objectContaining({ maxAge: 31_536_000, path: "/", sameSite: "lax" })
    );
  });

  it("rejects malformed custom input without changing the cookie", async () => {
    const formData = new FormData();
    formData.set("accentSelection", "custom");
    formData.set("accentColor", "var(--expense)");

    const result = await applyAccentPreference(INITIAL_ACCENT_ACTION_STATE, formData);

    expect(result.status).toBe("error");
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("treats the original green as the default instead of a custom preference", async () => {
    const formData = new FormData();
    formData.set("accentSelection", "custom");
    formData.set("accentColor", "#0f9d63");

    await expect(applyAccentPreference(INITIAL_ACCENT_ACTION_STATE, formData)).resolves.toEqual({
      status: "success",
      message: "Applied TreasuryOps default.",
      appliedKey: "default"
    });
    expect(mocks.delete).toHaveBeenCalledWith("treasury-ops-accent");
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("deletes the cookie for the default selection and reset action", async () => {
    const formData = new FormData();
    formData.set("accentSelection", "default");

    await applyAccentPreference(INITIAL_ACCENT_ACTION_STATE, formData);
    await resetAccentPreference();

    expect(mocks.delete).toHaveBeenCalledTimes(2);
    expect(mocks.delete).toHaveBeenCalledWith("treasury-ops-accent");
  });
});
