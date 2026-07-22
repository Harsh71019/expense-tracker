import { afterEach, describe, expect, it, vi } from "vitest";

async function loadDebug(): Promise<typeof import("./debug").debug> {
  vi.resetModules();
  const debugModule = await import("./debug");
  return debugModule.debug;
}

describe("debug logger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    window.localStorage.clear();
  });

  it("writes namespaced messages outside production", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const debug = await loadDebug();

    debug.api("session loaded");

    expect(spy).toHaveBeenCalledWith("[api]", "session loaded");
  });

  it("stays quiet in production unless the user enables diagnostics", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const debug = await loadDebug();

    debug.offline("queue checked");
    expect(spy).not.toHaveBeenCalled();

    window.localStorage.setItem("treasury-ops:debug", "1");
    const enabledDebug = await loadDebug();
    enabledDebug.offline("queue checked");
    expect(spy).toHaveBeenCalledWith("[offline]", "queue checked");
  });
});
