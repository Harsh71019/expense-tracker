import { HttpResponse, http, type HttpHandler } from "msw";

import { MOCK_USER_EMAIL, MOCK_USER_ID } from "../enabled";

export function authHandlers(baseUrl: string): HttpHandler[] {
  return [
    http.post(`${baseUrl}/auth/sign-in/email`, () =>
      HttpResponse.json({
        redirect: false,
        token: "mock-session-token",
        user: {
          id: MOCK_USER_ID,
          email: MOCK_USER_EMAIL,
          name: "TreasuryOps User",
          emailVerified: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z"
        }
      })
    ),
    http.post(`${baseUrl}/auth/sign-out`, () => HttpResponse.json({ success: true }))
  ];
}
