import { Injectable, UnauthorizedException } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { fromNodeHeaders } from "better-auth/node";
import type { Request } from "express";

import { AuthService } from "./auth.service.js";
import { UserProfileService } from "../user-profiles/user-profile.service.js";

export type AuthenticatedUser = Readonly<{ id: string }>;

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly profiles: UserProfileService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const session = await this.authService.auth.api.getSession({
      headers: fromNodeHeaders(request.headers)
    });

    if (session === null) {
      throw new UnauthorizedException();
    }

    await this.profiles.ensure(session.user.id, session.user.name);
    request.authUser = { id: session.user.id };
    return true;
  }
}
