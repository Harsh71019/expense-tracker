"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

import { Button } from "../../../components/ui/button";
import { authClient } from "../../../lib/auth/client";

export function SignOutButton({ compact = false }: Readonly<{ compact?: boolean }>): ReactNode {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut(): Promise<void> {
    setError(null);
    setIsSigningOut(true);
    try {
      await authClient.signOut();
      router.push("/login");
      router.refresh();
    } catch {
      setError("Unable to sign out right now. Check your connection and try again.");
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <div className={`flex flex-col items-start gap-2 ${compact ? "items-center" : ""}`}>
      <Button
        type="button"
        variant="secondary"
        onClick={signOut}
        disabled={isSigningOut}
        aria-label={compact ? "Sign out" : undefined}
        title={compact ? "Sign out" : undefined}
        className={compact ? "h-10 w-10 px-0 text-base" : undefined}
      >
        {compact ? (
          <>
            <span aria-hidden="true">↪</span>
            <span className="sr-only">Sign out</span>
          </>
        ) : isSigningOut ? (
          "Signing out…"
        ) : (
          "Sign out"
        )}
      </Button>
      {error === null ? null : (
        <p role="alert" className="text-sm text-expense">
          {error}
        </p>
      )}
    </div>
  );
}
