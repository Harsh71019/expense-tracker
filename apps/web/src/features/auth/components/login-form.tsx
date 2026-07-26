"use client";

import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { authClient } from "../../../lib/auth/client";
import { buildAuthHref, getSafeCallbackPath } from "../../../lib/auth/redirect";
import { toast } from "../../../lib/toast";
import { PasswordField } from "./password-field";

export function LoginForm(): ReactNode {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackURL = getSafeCallbackPath(searchParams.get("next"));
  const registrationCompleted = searchParams.get("registered") === "1";
  const registerHref = buildAuthHref("/register", callbackURL);

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);

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
        const message = result.error.message ?? "Sign-in failed.";
        setError(message);
        toast.error(message);
      } else {
        toast.success("Signed in successfully");
        router.push(callbackURL);
        router.refresh();
      }
    } catch {
      const message = "Unable to sign in right now. Check your connection and try again.";
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={signIn} className="flex flex-col gap-5">
      {registrationCompleted ? (
        <p
          role="status"
          className="rounded-lg border border-income/25 bg-income/10 px-3 py-2 text-center text-sm font-medium text-income"
        >
          If registration is available for this email, your account is ready. Sign in to continue.
        </p>
      ) : null}
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
      <PasswordField
        id="password"
        label="Password"
        value={password}
        autoComplete="current-password"
        onChange={setPassword}
      />
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
      <p className="text-center text-sm text-foreground-muted">
        Need an account?{" "}
        <Link
          href={registerHref}
          className="font-semibold text-accent hover:text-accent-strong hover:underline"
        >
          Register
        </Link>
      </p>
    </form>
  );
}
