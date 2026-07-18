import { getSessionCookie } from "better-auth/cookies";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest): NextResponse {
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
  matcher: ["/((?!login|api|images|_next/static|_next/image|favicon.ico).*)"]
};
