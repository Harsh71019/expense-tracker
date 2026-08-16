import type { ReactNode } from "react";

const SECTIONS = [
  { href: "#profile", label: "Profile" },
  { href: "#appearance", label: "Appearance" },
  { href: "#income", label: "Income & work" },
  { href: "#developer", label: "Developer access" }
] as const;

export function SettingsJumpNav(): ReactNode {
  return (
    <nav
      aria-label="Jump to a settings section"
      className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
    >
      {SECTIONS.map((section) => (
        <a
          key={section.href}
          href={section.href}
          className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {section.label}
        </a>
      ))}
    </nav>
  );
}
