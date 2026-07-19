import { beforeEach, describe, expect, it, vi } from "vitest";

import MorePage from "./page";

const mocks = vi.hoisted((): { redirect: ReturnType<typeof vi.fn> } => ({
  redirect: vi.fn()
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

describe("legacy more route", () => {
  beforeEach(() => {
    mocks.redirect.mockReset();
    mocks.redirect.mockImplementation((): never => {
      throw new Error("NEXT_REDIRECT");
    });
  });

  it("redirects to settings", () => {
    expect(() => MorePage()).toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/settings");
  });
});
