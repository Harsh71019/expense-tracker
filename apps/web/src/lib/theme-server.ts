import { cookies } from "next/headers";

import { isTheme, THEME_COOKIE_NAME, type Theme } from "./theme";

export async function getStoredTheme(): Promise<Theme | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(THEME_COOKIE_NAME)?.value;
  return isTheme(value) ? value : null;
}
