import { createAuthClient } from "better-auth/react";

const baseURL =
  typeof window === "undefined"
    ? (process.env.INTERNAL_API_URL ?? "http://localhost:4000/api")
    : new URL("/api", window.location.origin).toString();

export const authClient = createAuthClient({ baseURL });
