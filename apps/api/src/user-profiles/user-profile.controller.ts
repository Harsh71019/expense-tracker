import { Controller, Get } from "@nestjs/common";
import type { UserProfile } from "@treasury-ops/shared";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { UserProfileService } from "./user-profile.service.js";

@Controller("v1/profile")
export class UserProfileController {
  constructor(private readonly profiles: UserProfileService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser): Promise<UserProfile> {
    return this.profiles.get(user.id);
  }
}
