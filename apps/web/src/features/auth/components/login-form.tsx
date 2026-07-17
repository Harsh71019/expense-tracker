"use client";

import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useSearchParams } from "next/navigation";

import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { authClient } from "../../../lib/auth/client";
import { getSafeCallbackPath } from "../../../lib/auth/redirect";

export function LoginForm(): ReactNode {
  const searchParams = useSearchParams();
  const callbackURL = getSafeCallbackPath(searchParams.get("next"));

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Guards against a native (unhandled) form submission — which would GET
  // the page with the password in the URL query string — if the button is
  // tapped before React has finished hydrating and attached onSubmit.
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => setIsHydrated(true), []);

  async function signIn(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await authClient.signIn.email({ email, password, callbackURL });
      if (result.error !== null) {
        setError(result.error.message ?? "Sign-in failed.");
      }
    } catch {
      setError("Unable to sign in right now. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={signIn} className="flex flex-col gap-5">
      <Input
        id="email"
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />
      <Input
        id="password"
        name="password"
        type="password"
        label="Password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />
      <Button type="submit" disabled={isSubmitting || !isHydrated} className="w-full py-3.5">
        {isSubmitting ? "Signing in…" : "Sign in"}
      </Button>
      {error === null ? null : (
        <p
          role="alert"
          className="rounded-lg border border-expense/25 bg-expense/10 px-3 py-2 text-center font-mono text-[11px] font-semibold text-expense animate-fade-in"
        >
          {error}
        </p>
      )}
    </form>
  );
}
