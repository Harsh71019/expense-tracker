"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";

import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { authClient } from "../../../lib/auth/client";
import { buildAuthHref, getSafeCallbackPath } from "../../../lib/auth/redirect";
import { toast } from "../../../lib/toast";
import { PasswordField } from "./password-field";

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const REGISTRATION_SUCCESS_MESSAGE =
  "If registration is available for this email, your account is ready. Sign in to continue.";
const GENERIC_REGISTRATION_ERROR =
  "Unable to create your account right now. Check your details and try again.";
const EmailSchema = z.email();

export function RegisterForm(): ReactNode {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackURL = getSafeCallbackPath(searchParams.get("next"));
  const loginHref = buildAuthHref("/login", callbackURL);
  const registrationCompleteHref = buildAuthHref("/login", callbackURL, { registered: "1" });

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => setIsHydrated(true), []);
  useEffect(() => {
    if (error !== null) {
      errorRef.current?.focus();
    }
  }, [error]);

  async function register(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    const trimmedDisplayName = displayName.trim();
    const validationError = validateRegistration(
      trimmedDisplayName,
      email.trim(),
      password,
      confirmation
    );
    if (validationError !== null) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await authClient.signUp.email({
        name: trimmedDisplayName,
        email: email.trim(),
        password,
        callbackURL
      });
      if (result.error !== null) {
        const message = registrationErrorMessage(result.error);
        setError(message);
        toast.error(message);
        return;
      }

      toast.success(REGISTRATION_SUCCESS_MESSAGE);
      router.push(registrationCompleteHref);
    } catch {
      const message = "Unable to register right now. Check your connection and try again.";
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const hasError = error !== null;

  return (
    <form onSubmit={register} className="flex flex-col gap-5" noValidate>
      <Input
        id="display-name"
        name="name"
        type="text"
        label="Display name"
        autoComplete="name"
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
        required
        aria-describedby={hasError ? "registration-error" : undefined}
        aria-invalid={hasError && displayName.trim().length === 0}
      />
      <Input
        id="register-email"
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />
      <PasswordField
        id="register-password"
        label="Password"
        value={password}
        autoComplete="new-password"
        onChange={setPassword}
        minLength={MIN_PASSWORD_LENGTH}
        maxLength={MAX_PASSWORD_LENGTH}
        ariaDescribedBy={hasError ? "registration-error" : "password-requirements"}
        isInvalid={hasError}
      />
      <p id="password-requirements" className="-mt-3 text-xs text-foreground-muted">
        Use 8–128 characters.
      </p>
      <PasswordField
        id="confirm-password"
        label="Confirm password"
        value={confirmation}
        autoComplete="new-password"
        onChange={setConfirmation}
        minLength={MIN_PASSWORD_LENGTH}
        maxLength={MAX_PASSWORD_LENGTH}
        isInvalid={hasError}
        {...(hasError ? { ariaDescribedBy: "registration-error" } : {})}
      />
      <Button type="submit" disabled={isSubmitting || !isHydrated} className="w-full py-3.5">
        {isSubmitting ? "Creating account…" : "Create account"}
      </Button>
      {error === null ? null : (
        <p
          ref={errorRef}
          id="registration-error"
          role="alert"
          tabIndex={-1}
          className="rounded-lg border border-expense/25 bg-expense/10 px-3 py-2 text-center font-mono text-2xs font-semibold text-expense outline-none animate-fade-in"
        >
          {error}
        </p>
      )}
      <p className="text-center text-sm text-foreground-muted">
        Already have an account?{" "}
        <Link
          href={loginHref}
          className="inline-flex min-h-11 items-center font-semibold text-accent hover:text-accent-strong hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}

function validateRegistration(
  displayName: string,
  email: string,
  password: string,
  confirmation: string
): string | null {
  if (displayName.length === 0) {
    return "Enter your display name.";
  }
  if (!EmailSchema.safeParse(email).success) {
    return "Enter a valid email address.";
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return "Password must contain at least 8 characters.";
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return "Password must contain no more than 128 characters.";
  }
  if (password !== confirmation) {
    return "Passwords do not match.";
  }
  return null;
}

function registrationErrorMessage(error: unknown): string {
  if (typeof error !== "object" || error === null) {
    return GENERIC_REGISTRATION_ERROR;
  }

  const code = "code" in error && typeof error.code === "string" ? error.code : null;
  const status = "status" in error && typeof error.status === "number" ? error.status : null;

  if (code === "EMAIL_PASSWORD_SIGN_UP_DISABLED") {
    return "Registration is disabled for this TreasuryOps deployment.";
  }
  if (code === "TOO_MANY_REQUESTS" || status === 429) {
    return "Too many registration attempts. Wait a minute and try again.";
  }
  return GENERIC_REGISTRATION_ERROR;
}
