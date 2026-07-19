import "server-only";

import { cookies } from "next/headers";

import { ACCENT_COOKIE_NAME, parseAccentCookie } from "./accent";
import type { AccentPreference } from "./accent";

export async function getStoredAccent(): Promise<AccentPreference> {
  const cookieStore = await cookies();
  return parseAccentCookie(cookieStore.get(ACCENT_COOKIE_NAME)?.value);
}
