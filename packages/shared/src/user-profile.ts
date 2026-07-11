import { z } from "zod";

export const DEFAULT_USER_PROFILE = {
  locale: "en-IN",
  timezone: "Asia/Kolkata"
} as const;

export const UserProfileSchema = z.object({
  userId: z.string().min(1),
  displayName: z.string().trim().min(1).max(100),
  locale: z.literal(DEFAULT_USER_PROFILE.locale),
  timezone: z.literal(DEFAULT_USER_PROFILE.timezone),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const UserProfileUpdateSchema = UserProfileSchema.pick({
  displayName: true
});

export type UserProfile = z.infer<typeof UserProfileSchema>;
export type UserProfileUpdate = z.infer<typeof UserProfileUpdateSchema>;
