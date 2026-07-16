import { afterEach, describe, expect, it, vi } from "vitest";

import { getApiBaseUrl } from "./base-url";

describe("getApiBaseUrl", () => {
  it("uses the browser origin and keeps API calls same-origin", () => {
    expect(getApiBaseUrl()).toBe("http://localhost:3000/api");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.INTERNAL_API_URL;
  });

  it("uses the configured internal API URL during server rendering", () => {
    vi.stubGlobal("window", undefined);
    process.env.INTERNAL_API_URL = "http://api:4000/api";

    expect(getApiBaseUrl()).toBe("http://api:4000/api");
  });

  it("uses the local internal API default during server rendering", () => {
    vi.stubGlobal("window", undefined);

    expect(getApiBaseUrl()).toBe("http://localhost:4000/api");
  });
});
