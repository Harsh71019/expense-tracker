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
  const [rememberMe, setRememberMe] = useState(true);
  const [revealPassword, setRevealPassword] = useState(false);

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
      const result = await authClient.signIn.email({ email, password, rememberMe, callbackURL });
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
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="password"
          className="font-mono text-[9px] font-extrabold tracking-[0.25em] text-foreground-muted uppercase"
        >
          Password
        </label>
        <div className="flex items-center rounded-lg border border-border bg-surface pr-1.5 transition-colors duration-150 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30">
          <input
            id="password"
            name="password"
            type={revealPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            className="w-full min-w-0 flex-1 bg-transparent px-3.5 py-2.5 text-sm text-foreground outline-none placeholder:text-foreground-muted/50"
          />
          <button
            type="button"
            onClick={() => setRevealPassword((value) => !value)}
            className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-foreground-muted hover:text-foreground"
          >
            {revealPassword ? "Hide" : "Show"}
          </button>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-foreground-muted select-none">
        <input
          type="checkbox"
          checked={rememberMe}
          onChange={(event) => setRememberMe(event.target.checked)}
          className="h-3.5 w-3.5 accent-accent"
        />
        Keep me signed in
      </label>
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
