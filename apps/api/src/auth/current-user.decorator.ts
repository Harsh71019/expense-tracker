import { createParamDecorator, UnauthorizedException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

import type { AuthenticatedUser } from "./auth.guard.js";

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.authUser === undefined) {
      throw new UnauthorizedException();
    }

    return request.authUser;
  }
);
