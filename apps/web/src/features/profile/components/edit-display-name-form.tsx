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
    <section className="glass-card rounded-2xl p-5 shadow-sm sm:p-6">
      <header>
        <h2 className="text-lg font-bold tracking-tight text-foreground">Display Name</h2>
        <p className="mt-1 text-xs leading-relaxed text-foreground-muted sm:text-sm pretty-text">
          Shown across TreasuryOps transactions, audit logs, and reports wherever your identity is
          displayed.
        </p>
      </header>

      <form onSubmit={submit} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Input
            id="display-name"
            label="Display name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={100}
          />
          {error === null ? null : (
            <span
              role="alert"
              aria-live="polite"
              className="mt-1.5 inline-block rounded-lg border border-expense/25 bg-expense/10 px-2.5 py-0.5 font-mono text-[10px] text-expense"
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
