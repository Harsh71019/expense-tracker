import { getSessionCookie } from "better-auth/cookies";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { isMockApiEnabled } from "./mocks/enabled";

const PUBLIC_AUTH_PATHS = new Set(["/login", "/register"]);

export function proxy(request: NextRequest): NextResponse {
  if (request.method === "POST" && PUBLIC_AUTH_PATHS.has(request.nextUrl.pathname)) {
    // /login and /register aren't prerendered, so Next.js silently 200s a stray
    // POST to the page route (e.g. a native form submission racing hydration)
    // instead of erroring -- it never reads the body, so nothing happens and
    // the user sees what looks like a no-op success. Redirect to a GET of the
    // same URL so a stray POST just reloads the page instead of masquerading
    // as a completed sign-in/registration.
    return NextResponse.redirect(
      new URL(request.nextUrl.pathname + request.nextUrl.search, request.url),
      303
    );
  }

  if (isMockApiEnabled || PUBLIC_AUTH_PATHS.has(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(request);

  const hasSessionToken = request.cookies
    .getAll()
    .some((cookie) => cookie.name.endsWith("better-auth.session_token"));

  if (sessionCookie === null && !hasSessionToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!login|register|api|images|_next/static|_next/image|favicon.ico).*)",
    "/login",
    "/register"
  ]
};
