import { Module } from "@nestjs/common";

import { UserProfileController } from "./user-profile.controller.js";
import { UserProfileRepository } from "./user-profile.repository.js";
import { UserProfileService } from "./user-profile.service.js";

@Module({
  controllers: [UserProfileController],
  providers: [UserProfileRepository, UserProfileService],
  exports: [UserProfileRepository, UserProfileService]
})
export class UserProfilesModule {}
