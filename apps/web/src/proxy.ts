import { getSessionCookie } from "better-auth/cookies";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { isMockApiEnabled } from "./mocks/enabled";

const PUBLIC_AUTH_PATHS = new Set(["/login", "/register"]);

export function proxy(request: NextRequest): NextResponse {
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
  matcher: ["/((?!login|register|api|images|_next/static|_next/image|favicon.ico).*)"]
};
