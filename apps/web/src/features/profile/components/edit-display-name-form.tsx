"use client";

import { UserProfileUpdateSchema, type UserProfile } from "@treasury-ops/shared";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { userErrorMessage, ValidationError } from "@/lib/errors";
import { toast } from "@/lib/toast";

import { useProfile, useUpdateProfile } from "../hooks/use-profile";

type EditDisplayNameFormProps = Readonly<{ initialProfile: UserProfile | null }>;

export function EditDisplayNameForm({ initialProfile }: EditDisplayNameFormProps): ReactNode {
  const { data: profile } = useProfile(initialProfile);
  const update = useUpdateProfile();
  const [displayName, setDisplayName] = useState(profile?.displayName ?? "");
  const [error, setError] = useState<string | null>(null);

  if (profile === null || profile === undefined) {
    return null;
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsed = UserProfileUpdateSchema.safeParse({ displayName });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid name");
      return;
    }
    setError(null);
    try {
      const updated = await update.mutateAsync(parsed.data);
      setDisplayName(updated.displayName);
      toast.success("Profile updated");
    } catch (thrown: unknown) {
      if (thrown instanceof ValidationError) {
        setError(thrown.fields[0]?.message ?? thrown.message);
      } else {
        toast.error(userErrorMessage(thrown, "Could not update your profile."));
      }
    }
  }

  const unchanged = displayName === profile.displayName;

  return (
    <section className="glass-card rounded-2xl p-4 shadow-xs sm:p-5">
      <header className="flex items-center justify-between pb-2">
        <h2 className="text-sm font-bold tracking-tight text-foreground sm:text-base">
          Display name
        </h2>
      </header>

      <form onSubmit={submit} className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Input
            id="display-name"
            label="Display name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={100}
            className="h-10 text-xs"
          />
          {error === null ? null : (
            <span
              role="alert"
              aria-live="polite"
              className="mt-1.5 inline-block rounded-lg border border-expense/25 bg-expense/10 px-2.5 py-0.5 font-mono text-2xs text-expense"
            >
              {error}
            </span>
          )}
        </div>
        <Button type="submit" disabled={update.isPending || unchanged || displayName.trim() === ""}>
          {update.isPending ? "Saving…" : "Save Changes"}
        </Button>
      </form>
    </section>
  );
}
