import { createParamDecorator } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

import type { AuthenticatedUser } from "./auth.guard.js";
import { UnauthenticatedError } from "../common/errors/unauthenticated.error.js";

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.authUser === undefined) {
      throw new UnauthenticatedError();
    }

    return request.authUser;
  }
);
