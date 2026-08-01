"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

import { Button } from "../../../components/ui/button";
import { authClient } from "../../../lib/auth/client";
import { toast } from "../../../lib/toast";

export function SignOutButton({ compact = false }: Readonly<{ compact?: boolean }>): ReactNode {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut(): Promise<void> {
    setError(null);
    setIsSigningOut(true);
    try {
      await authClient.signOut();
      toast.success("Signed out successfully");
      router.push("/login");
      router.refresh();
    } catch {
      const message = "Unable to sign out right now. Check your connection and try again.";
      setError(message);
      toast.error(message);
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
        className={
          compact
            ? "h-11 w-11 border-expense/30 bg-expense/5 px-0 text-base text-expense hover:border-expense/50 hover:text-expense"
            : "min-h-11 border-expense/30 bg-expense/5 text-expense hover:border-expense/50 hover:bg-expense/10 hover:text-expense"
        }
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
