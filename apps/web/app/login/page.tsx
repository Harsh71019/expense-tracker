"use client";

import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { authClient } from "../../src/auth-client.js";

export default function LoginPage(): ReactNode {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function signIn(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    if (email.length === 0 || password.length === 0) {
      setError("Email and password are required.");
      setIsSubmitting(false);
      return;
    }

    const result = await authClient.signIn.email({ email, password, callbackURL: "/" });
    if (result.error !== null) {
      setError(result.error.message ?? "Sign-in failed.");
      setIsSubmitting(false);
    }
  }

  return (
    <main>
      <h1>Vyaya</h1>
      <form onSubmit={signIn}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Signing in…" : "Sign in"}
        </button>
        {error === null ? null : <p role="alert">{error}</p>}
      </form>
    </main>
  );
}
