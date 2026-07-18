import { Inject, Injectable } from "@nestjs/common";
import {
  DEFAULT_USER_PROFILE,
  UserProfileSchema,
  UserProfileUpdateSchema,
  type UserProfile
} from "@vyaya/shared";
import { eq } from "drizzle-orm";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { userProfiles } from "../common/db/schema/index.js";

@Injectable()
export class UserProfileRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async findByUserId(userId: string): Promise<UserProfile | null> {
    const [row] = await this.db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
    return row === undefined ? null : UserProfileSchema.parse(row);
  }

  async create(userId: string, displayName: string): Promise<UserProfile> {
    const now = new Date();
    const [row] = await this.db
      .insert(userProfiles)
      .values({ userId, displayName, ...DEFAULT_USER_PROFILE, createdAt: now, updatedAt: now })
      .returning();
    return UserProfileSchema.parse(row);
  }

  async ensure(userId: string, displayName: string): Promise<UserProfile> {
    const now = new Date();
    await this.db
      .insert(userProfiles)
      .values({ userId, displayName, ...DEFAULT_USER_PROFILE, createdAt: now, updatedAt: now })
      .onConflictDoNothing({ target: userProfiles.userId });

    const savedProfile = await this.findByUserId(userId);
    if (savedProfile === null) {
      throw new Error("User profile was not persisted");
    }
    return savedProfile;
  }

  async update(userId: string, input: unknown): Promise<UserProfile | null> {
    const update = UserProfileUpdateSchema.parse(input);
    const [row] = await this.db
      .update(userProfiles)
      .set({ ...update, updatedAt: new Date() })
      .where(eq(userProfiles.userId, userId))
      .returning();
    return row === undefined ? null : UserProfileSchema.parse(row);
  }
}
