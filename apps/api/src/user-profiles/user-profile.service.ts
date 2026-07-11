import { Injectable, NotFoundException } from "@nestjs/common";
import { type UserProfile } from "@vyaya/shared";

import { UserProfileRepository } from "./user-profile.repository.js";

@Injectable()
export class UserProfileService {
  constructor(private readonly profiles: UserProfileRepository) {}

  async ensure(userId: string, displayName: string): Promise<UserProfile> {
    return this.profiles.ensure(userId, displayName);
  }

  async get(userId: string): Promise<UserProfile> {
    const profile = await this.profiles.findByUserId(userId);
    if (profile === null) {
      throw new NotFoundException("User profile not found");
    }

    return profile;
  }
}
