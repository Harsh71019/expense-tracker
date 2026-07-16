export type Theme = "light" | "dark";

export const THEME_COOKIE_NAME = "vyaya-theme";

export function isTheme(value: string | undefined): value is Theme {
  return value === "light" || value === "dark";
}
