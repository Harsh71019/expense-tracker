import Image from "next/image";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>): ReactNode {
  return (
    <div className="min-h-screen bg-surface lg:grid lg:grid-cols-2">
      <section className="flex min-h-screen items-center justify-center px-5 py-12 sm:px-10 lg:px-16 xl:px-24 animate-fade-in">
        <div className="w-full max-w-md">
          <div className="mb-10">
            <span className="font-mono text-sm font-semibold tracking-[0.25em] text-foreground uppercase">
              Vyaya
            </span>
            <div className="mt-2.5 h-0.5 w-6 bg-accent rounded-full" aria-hidden="true" />
          </div>
          <div className="mb-8">
            <p className="font-mono text-[10px] font-bold tracking-widest text-foreground-muted uppercase">
              Your money, in focus
            </p>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
              Welcome back.
            </h1>
            <p className="mt-3 max-w-sm text-sm leading-6 text-foreground-muted">
              Sign in to keep every expense, account, and correction in one clear ledger.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface-elevated p-6 sm:p-8">
            {children}
          </div>
          <p className="mt-6 text-xs leading-5 text-foreground-muted">
            Private by design. Your account is protected with a secure session.
          </p>
        </div>
      </section>
      <aside className="relative hidden min-h-screen overflow-hidden lg:block" aria-hidden="true">
        <Image
          src="/images/login-ledger-hero.png"
          alt=""
          fill
          priority
          sizes="50vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-linear-to-t from-foreground/80 via-foreground/15 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-12 xl:p-16">
          <div className="max-w-md border-l-2 border-accent pl-5 text-surface">
            <p className="font-mono text-[10px] font-bold tracking-[0.25em] text-surface-muted uppercase">
              A calmer way to keep track
            </p>
            <p className="mt-3 text-3xl font-extrabold leading-tight tracking-tight">
              Spend with context. Keep the record clean.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
