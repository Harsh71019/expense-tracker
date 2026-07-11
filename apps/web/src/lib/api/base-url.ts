export function getApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return process.env.INTERNAL_API_URL ?? "http://localhost:4000/api";
  }

  return new URL("/api", window.location.origin).toString();
}
