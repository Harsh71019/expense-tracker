import type { ReactNode } from "react";

import { SignOutButton } from "@/features/auth";
import { getSession } from "@/lib/api/session";

export default async function MorePage(): Promise<ReactNode> {
  const session = await getSession();

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Account</h1>
      {session === null ? null : (
        <p className="text-sm text-foreground-muted">Signed in as {session.user.email}</p>
      )}
      <div className="md:hidden">
        <SignOutButton />
      </div>
    </section>
  );
}
