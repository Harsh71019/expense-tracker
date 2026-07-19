"use server";

import { cookies } from "next/headers";

import { getStoredTheme } from "./theme-server";
import { isThemePreference, THEME_COOKIE_NAME, THEME_PREFERENCES, type Theme } from "./theme";

const COOKIE_OPTIONS = {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax"
} as const;

export async function toggleTheme(): Promise<void> {
  const current = await getStoredTheme();
  const next: Theme = current === "light" ? "dark" : "light";

  const cookieStore = await cookies();
  cookieStore.set(THEME_COOKIE_NAME, next, COOKIE_OPTIONS);
}

export async function applyThemePreference(formData: FormData): Promise<void> {
  const value = formData.get("theme");
  if (typeof value !== "string" || !isThemePreference(value)) {
    return;
  }

  const cookieStore = await cookies();
  if (value === THEME_PREFERENCES.system) {
    cookieStore.delete(THEME_COOKIE_NAME);
    return;
  }
  cookieStore.set(THEME_COOKIE_NAME, value, COOKIE_OPTIONS);
}
