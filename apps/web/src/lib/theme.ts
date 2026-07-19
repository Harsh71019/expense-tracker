export type Theme = "light" | "dark";

export const THEME_PREFERENCES = {
  light: "light",
  dark: "dark",
  system: "system"
} as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[keyof typeof THEME_PREFERENCES];

export const THEME_COOKIE_NAME = "vyaya-theme";

export function isTheme(value: string | undefined): value is Theme {
  return value === "light" || value === "dark";
}

export function isThemePreference(value: string | undefined): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}
