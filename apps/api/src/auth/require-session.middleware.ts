import { fromNodeHeaders } from "better-auth/node";
import type { NextFunction, Request, Response } from "express";

import type { AuthService } from "./auth.service.js";

/**
 * Raw Express middleware (not a Nest guard) for routes mounted directly on
 * the underlying HTTP adapter rather than through a Nest controller — Bull
 * Board's router, same as Better Auth's own handler. AuthGuard can't apply
 * here since there's no Nest execution context; this does the same session
 * check by hand.
 */
export function requireSession(auth: AuthService) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const session = await auth.auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (session === null) {
      res.status(401).json({ message: "Authentication required." });
      return;
    }
    next();
  };
}
