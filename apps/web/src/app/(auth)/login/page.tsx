import { Suspense } from "react";
import type { ReactNode } from "react";

import { LoginForm } from "@/features/auth";

export default function LoginPage(): ReactNode {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        Welcome back
      </h1>
      <p className="mt-2 mb-8 text-sm leading-relaxed text-foreground-muted">
        Sign in to pick up where your money left off.
      </p>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </>
  );
}
