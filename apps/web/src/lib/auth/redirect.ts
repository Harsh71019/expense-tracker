type AuthPath = "/login" | "/register";

export function getSafeCallbackPath(value: string | null): string {
  if (value === null || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/";
  }

  return value;
}

export function buildAuthHref(
  path: AuthPath,
  callbackPath: string,
  extraParams: Readonly<Record<string, string>> = {}
): string {
  const params = new URLSearchParams(extraParams);
  if (callbackPath !== "/") {
    params.set("next", callbackPath);
  }
  const query = params.toString();
  return query.length === 0 ? path : `${path}?${query}`;
}
