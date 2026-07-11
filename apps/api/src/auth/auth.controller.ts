import { Controller, Get, UseGuards } from "@nestjs/common";

import { AuthGuard, type AuthenticatedUser } from "./auth.guard.js";
import { CurrentUser } from "./current-user.decorator.js";

@Controller("v1/auth")
@UseGuards(AuthGuard)
export class AuthController {
  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
