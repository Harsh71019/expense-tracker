import { Injectable, UnauthorizedException } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { fromNodeHeaders } from "better-auth/node";
import type { Request } from "express";

import { AuthService } from "./auth.service.js";
import { IS_PUBLIC_KEY } from "./public.decorator.js";
import { LoggingContextService } from "../common/logging/logging-context.service.js";
import { UserProfileService } from "../user-profiles/user-profile.service.js";

export type AuthenticatedUser = Readonly<{ id: string }>;

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly profiles: UserProfileService,
    private readonly reflector: Reflector,
    private readonly loggingContext: LoggingContextService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const session = await this.authService.auth.api.getSession({
      headers: fromNodeHeaders(request.headers)
    });

    if (session === null) {
      throw new UnauthorizedException();
    }

    await this.profiles.ensure(session.user.id, session.user.name);
    this.loggingContext.set({ userId: session.user.id });
    request.authUser = { id: session.user.id };
    return true;
  }
}
