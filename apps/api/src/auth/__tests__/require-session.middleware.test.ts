import { describe, expect, it, vi } from "vitest";

import { requireSession } from "../require-session.middleware.js";

function mockResponse() {
  const response = { status: vi.fn(), json: vi.fn() };
  response.status.mockReturnValue(response);
  return response;
}

describe("requireSession", () => {
  it("calls next() when a session exists", async () => {
    const mockAuth = { auth: { api: { getSession: vi.fn().mockResolvedValue({ user: {} }) } } };
    // @ts-expect-error - mock AuthService for unit testing
    const middleware = requireSession(mockAuth);
    const next = vi.fn();
    const response = mockResponse();

    // @ts-expect-error - mock Request for unit testing
    await middleware({ headers: {} }, response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(response.status).not.toHaveBeenCalled();
  });

  it("responds 401 without calling next() when there is no session", async () => {
    const mockAuth = { auth: { api: { getSession: vi.fn().mockResolvedValue(null) } } };
    // @ts-expect-error - mock AuthService for unit testing
    const middleware = requireSession(mockAuth);
    const next = vi.fn();
    const response = mockResponse();

    // @ts-expect-error - mock Request for unit testing
    await middleware({ headers: {} }, response, next);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith({ message: "Authentication required." });
  });
});
