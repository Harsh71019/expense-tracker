import type { AuthenticatedUser } from "./auth.guard.js";

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthenticatedUser;
      authMethod?: "session" | "api-key";
    }
  }
}

export {};
