import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(
  (): {
    configurations: unknown[];
    debug: ReturnType<typeof vi.fn>;
    requestId: ReturnType<typeof vi.fn>;
  } => ({
    configurations: [],
    debug: vi.fn(),
    requestId: vi.fn(() => "request-123")
  })
);

vi.mock("better-auth/react", () => ({
  createAuthClient: (configuration: unknown) => {
    mocks.configurations.push(configuration);
    return {};
  }
}));

vi.mock("../api/base-url", () => ({ getApiBaseUrl: () => "http://localhost:3000/api" }));
vi.mock("../debug", () => ({ debug: { api: mocks.debug } }));
vi.mock("../request-id", () => ({ generateRequestId: mocks.requestId }));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getCallback(value: unknown, key: string): (context: unknown) => void {
  if (!isRecord(value)) {
    throw new Error("Expected an options object");
  }

  const callback = value[key];
  if (typeof callback !== "function") {
    throw new Error(`Expected ${key} callback`);
  }

  return (context: unknown): void => {
    callback(context);
  };
}

describe("authClient", () => {
  it("configures the same-origin auth endpoint and correlation logging hooks", async () => {
    await import("./client");

    const configuration = mocks.configurations[0];
    if (!isRecord(configuration)) {
      throw new Error("Expected Better Auth client configuration");
    }

    expect(configuration.baseURL).toBe("http://localhost:3000/api/auth");
    const fetchOptions = configuration.fetchOptions;
    const onRequest = getCallback(fetchOptions, "onRequest");
    const onSuccess = getCallback(fetchOptions, "onSuccess");
    const onError = getCallback(fetchOptions, "onError");
    const headers = new Headers();
    const request = new Request("http://localhost:3000/api/auth/sign-in/email", { headers });
    const response = new Response(null, { status: 200 });

    onRequest({ headers, method: "POST", url: request.url });
    onSuccess({ request, response });
    onError({ request, response: new Response(null, { status: 401 }) });

    expect(headers.get("x-request-id")).toBe("request-123");
    expect(mocks.debug).toHaveBeenCalledWith(expect.stringContaining("-> POST"));
    expect(mocks.debug).toHaveBeenCalledWith(expect.stringContaining("<- 200"));
    expect(mocks.debug).toHaveBeenCalledWith(expect.stringContaining("<- 401"));
  });
});
