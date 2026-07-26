"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserProfileSchema, type UserProfile, type UserProfileUpdate } from "@treasury-ops/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

export function useProfile(
  initialProfile: UserProfile | null
): ReturnType<typeof useQuery<UserProfile | null, Error>> {
  return useQuery({
    queryKey: qk.profile(),
    initialData: initialProfile,
    queryFn: async (): Promise<UserProfile | null> => {
      try {
        const result = await apiClient.GET("/v1/profile");
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = UserProfileSchema.safeParse(result.data);
        return parsed.success ? parsed.data : null;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    }
  });
}

// No Idempotency-Key here -- PATCH /v1/profile re-setting the same displayName
// is naturally idempotent (no double-insert risk), and the backend doesn't
// declare the header on this route (docs/plans/2026-07-25-profile-backend.md).
export function useUpdateProfile(): ReturnType<
  typeof useMutation<UserProfile, Error, UserProfileUpdate>
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input): Promise<UserProfile> => {
      try {
        const result = await apiClient.PATCH("/v1/profile", { body: input });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = UserProfileSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: qk.profile() });
    }
  });
}
