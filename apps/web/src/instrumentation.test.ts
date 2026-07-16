import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureRequestError: vi.fn(),
  init: vi.fn()
}));

vi.mock("@sentry/nextjs", () => ({
  captureRequestError: mocks.captureRequestError,
  init: mocks.init
}));

async function loadInstrumentation(): Promise<typeof import("./instrumentation")> {
  vi.resetModules();
  return import("./instrumentation");
}

describe("server instrumentation", () => {
  afterEach(() => {
    mocks.init.mockReset();
    vi.unstubAllEnvs();
  });

  it("initializes Sentry in the Node runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NEXT_PUBLIC_GLITCHTIP_DSN", "https://example.invalid/1");
    const instrumentation = await loadInstrumentation();

    await instrumentation.register();

    expect(mocks.init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: "https://example.invalid/1", tracesSampleRate: 0 })
    );
    expect(instrumentation.onRequestError).toBe(mocks.captureRequestError);
  });

  it("does not initialize Sentry in non-Node runtimes", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    const instrumentation = await loadInstrumentation();

    await instrumentation.register();

    expect(mocks.init).not.toHaveBeenCalled();
  });
});
