import { Controller, Get, UseGuards } from "@nestjs/common";
import type { UserProfile } from "@vyaya/shared";

import { AuthGuard, type AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { UserProfileService } from "./user-profile.service.js";

@Controller("v1/profile")
@UseGuards(AuthGuard)
export class UserProfileController {
  constructor(private readonly profiles: UserProfileService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser): Promise<UserProfile> {
    return this.profiles.get(user.id);
  }
}
