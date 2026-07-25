import { afterEach, describe, expect, it, vi } from "vitest";

async function loadDebug(): Promise<typeof import("./debug").debug> {
  vi.resetModules();
  const debugModule = await import("./debug");
  return debugModule.debug;
}

describe("debug logger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("stays quiet by default", async () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const debug = await loadDebug();

    debug.offline("queue checked");

    expect(spy).not.toHaveBeenCalled();
  });

  it("writes namespaced messages once the user enables diagnostics", async () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    window.localStorage.setItem("treasury-ops:debug", "1");

    const debug = await loadDebug();
    debug.api("session loaded");

    expect(spy).toHaveBeenCalledWith("[api]", "session loaded");
  });
});
