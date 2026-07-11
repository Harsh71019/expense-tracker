import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import {
  DEFAULT_USER_PROFILE,
  UserProfileSchema,
  UserProfileUpdateSchema,
  type UserProfile
} from "@vyaya/shared";
import type { Connection } from "mongoose";

const USER_PROFILES_COLLECTION = "user_profiles";

@Injectable()
export class UserProfileRepository {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async findByUserId(userId: string): Promise<UserProfile | null> {
    const profile = await this.database().collection(USER_PROFILES_COLLECTION).findOne({ userId });

    return profile === null ? null : UserProfileSchema.parse(profile);
  }

  async create(userId: string, displayName: string): Promise<UserProfile> {
    const now = new Date();
    const profile = UserProfileSchema.parse({
      userId,
      displayName,
      ...DEFAULT_USER_PROFILE,
      createdAt: now,
      updatedAt: now
    });

    await this.database().collection(USER_PROFILES_COLLECTION).insertOne(profile);
    return profile;
  }

  async ensure(userId: string, displayName: string): Promise<UserProfile> {
    const now = new Date();
    const profile = UserProfileSchema.parse({
      userId,
      displayName,
      ...DEFAULT_USER_PROFILE,
      createdAt: now,
      updatedAt: now
    });

    await this.database()
      .collection(USER_PROFILES_COLLECTION)
      .updateOne({ userId }, { $setOnInsert: profile }, { upsert: true });

    const savedProfile = await this.findByUserId(userId);
    if (savedProfile === null) {
      throw new Error("User profile was not persisted");
    }

    return savedProfile;
  }

  async update(userId: string, input: unknown): Promise<UserProfile | null> {
    const update = UserProfileUpdateSchema.parse(input);
    const result = await this.database()
      .collection(USER_PROFILES_COLLECTION)
      .findOneAndUpdate(
        { userId },
        { $set: { ...update, updatedAt: new Date() } },
        { returnDocument: "after" }
      );

    return result === null ? null : UserProfileSchema.parse(result);
  }

  private database(): NonNullable<Connection["db"]> {
    const database = this.connection.db;
    if (database === undefined) {
      throw new Error("MongoDB connection is not ready");
    }

    return database;
  }
}
