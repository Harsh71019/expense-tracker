import Image from "next/image";
import type { ReactNode } from "react";

import { ThemeToggle } from "@/components/ui/theme-toggle";
import { getStoredTheme } from "@/lib/theme-server";

export default async function AuthLayout({
  children
}: Readonly<{ children: ReactNode }>): Promise<ReactNode> {
  const theme = await getStoredTheme();

  return (
    <div className="relative min-h-screen overflow-hidden bg-surface lg:grid lg:grid-cols-2">
      <div className="absolute top-5 right-5 z-20">
        <ThemeToggle current={theme} compact />
      </div>

      <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-12 sm:px-10 lg:px-16 xl:px-24 animate-fade-in">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 -right-20 h-[480px] w-[480px] animate-float-glow rounded-full bg-accent-glow blur-3xl"
        />

        <div className="relative w-full max-w-md">
          <div className="rounded-2xl border border-border bg-surface-elevated p-6 sm:p-8">
            <div className="mb-8 flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent font-mono text-xl font-bold text-accent-foreground shadow-glow-strong">
                ₹
              </span>
              <div>
                <p className="text-lg font-bold tracking-tight text-foreground">Vyaya</p>
                <p className="mt-0.5 font-mono text-[9px] font-bold tracking-[0.2em] text-accent uppercase">
                  Expense tracker
                </p>
              </div>
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Welcome back
            </h1>
            <p className="mt-2 mb-8 text-sm leading-relaxed text-foreground-muted">
              Sign in to pick up where your money left off.
            </p>

            {children}
          </div>

          <p className="mt-8 text-center font-mono text-[11px] text-foreground-muted">
            Protected by end-to-end encryption · India (INR)
          </p>
        </div>
      </section>

      <aside
        className="relative m-3.5 hidden overflow-hidden rounded-3xl lg:block"
        aria-hidden="true"
      >
        <Image
          src="/images/login-ledger-hero.png"
          alt=""
          fill
          priority
          sizes="50vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/10 to-transparent" />
        <div className="absolute inset-x-8 bottom-8">
          <p className="font-mono text-4xl leading-none font-bold text-accent">&ldquo;</p>
          <p className="mt-3 max-w-md text-2xl leading-snug font-semibold tracking-tight text-white">
            Every rupee accounted for. Clarity you can see at a glance.
          </p>
          <p className="mt-3 font-mono text-xs text-white/70">— Your money, organized</p>
        </div>
      </aside>
    </div>
  );
}
