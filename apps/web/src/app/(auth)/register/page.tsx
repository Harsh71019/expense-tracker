import { Suspense } from "react";
import type { ReactNode } from "react";

import { RegisterForm } from "@/features/auth";

export default function RegisterPage(): ReactNode {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        Create your account
      </h1>
      <p className="mt-2 mb-8 text-sm leading-relaxed text-foreground-muted">
        Registration is controlled by this TreasuryOps deployment.
      </p>
      <Suspense fallback={null}>
        <RegisterForm />
      </Suspense>
    </>
  );
}
