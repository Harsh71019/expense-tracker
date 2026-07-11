"use client";

import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useSearchParams } from "next/navigation";

import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { authClient } from "../../../lib/auth/client";

export function LoginForm(): ReactNode {
  const searchParams = useSearchParams();
  const callbackURL = searchParams.get("next") ?? "/";

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function signIn(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const result = await authClient.signIn.email({ email, password, callbackURL });
    if (result.error !== null) {
      setError(result.error.message ?? "Sign-in failed.");
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={signIn} className="flex flex-col gap-4">
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
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Signing in…" : "Sign in"}
      </Button>
      {error === null ? null : (
        <p role="alert" className="text-sm text-expense">
          {error}
        </p>
      )}
    </form>
  );
}
