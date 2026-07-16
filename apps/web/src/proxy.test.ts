import { getSessionCookie } from "better-auth/cookies";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { proxy } from "./proxy";

vi.mock("better-auth/cookies", () => ({ getSessionCookie: vi.fn() }));

const mockedGetSessionCookie = vi.mocked(getSessionCookie);

describe("proxy", () => {
  beforeEach(() => {
    mockedGetSessionCookie.mockReset();
  });

  it("redirects missing sessions to login with the requested pathname", () => {
    mockedGetSessionCookie.mockReturnValue(null);

    const response = proxy(new NextRequest("http://localhost:3000/transactions?limit=50"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?next=%2Ftransactions%3Flimit%3D50"
    );
  });

  it("allows requests that contain a session cookie", () => {
    mockedGetSessionCookie.mockReturnValue("session-token");

    const response = proxy(new NextRequest("http://localhost:3000/transactions"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
