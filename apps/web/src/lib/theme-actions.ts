"use server";

import { cookies } from "next/headers";

import { getStoredTheme } from "./theme-server";
import { THEME_COOKIE_NAME, type Theme } from "./theme";

export async function toggleTheme(): Promise<void> {
  const current = await getStoredTheme();
  const next: Theme = current === "light" ? "dark" : "light";

  const cookieStore = await cookies();
  cookieStore.set(THEME_COOKIE_NAME, next, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax"
  });
}
