import type { ReactNode } from "react";

import { SectionHeader } from "@/components/ui/section-header";
import { SignOutButton } from "@/features/auth";
import { EditDisplayNameForm, ProfileSummary } from "@/features/profile";
import { getProfile } from "@/features/profile/server/get-profile";
import { getSession } from "@/lib/api/session";

export async function ProfileSection(): Promise<ReactNode> {
  const [session, profile] = await Promise.all([getSession(), getProfile()]);
  const email = session?.user.email ?? "";

  return (
    <section id="profile" className="scroll-mt-20 space-y-4">
      <SectionHeader title="Profile" description="Your name, email, and current session." />
      <div className="grid gap-4 md:grid-cols-2">
        <ProfileSummary profile={profile} email={email} action={<SignOutButton />} />
        <EditDisplayNameForm initialProfile={profile} />
      </div>
    </section>
  );
}
