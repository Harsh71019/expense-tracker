import { Controller, Get } from "@nestjs/common";

import type { AuthenticatedUser } from "./auth.guard.js";
import { CurrentUser } from "./current-user.decorator.js";

@Controller("v1/auth")
export class AuthController {
  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
