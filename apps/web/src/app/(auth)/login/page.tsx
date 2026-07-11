import { Suspense } from "react";
import type { ReactNode } from "react";

import { LoginForm } from "@/features/auth";

export default function LoginPage(): ReactNode {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
