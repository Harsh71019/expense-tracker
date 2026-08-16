"use client";

import { Keyboard } from "lucide-react";
import type { ReactNode } from "react";

import { DialogSurface } from "@/components/ui/dialog";

type ShortcutEntry = {
  keys: string[];
  description: string;
};

const SHORTCUTS: ShortcutEntry[] = [
  { keys: ["⌘", "K"], description: "Open Command Palette / Search" },
  { keys: ["⌘", "P"], description: "Toggle Privacy Mode (hide balances)" },
  { keys: ["?"], description: "Show Keyboard Shortcuts Cheat Sheet" },
  { keys: ["ESC"], description: "Close Modals / Sheets / Command Palette" }
];

export function KeyboardShortcutsDialog({
  open,
  onClose
}: Readonly<{
  open: boolean;
  onClose: () => void;
}>): ReactNode {
  if (!open) return null;

  return (
    <DialogSurface labelledBy="shortcuts-dialog-title" onClose={onClose}>
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent-glow text-accent">
          <Keyboard size={18} />
        </span>
        <div>
          <h2 id="shortcuts-dialog-title" className="text-base font-bold text-foreground">
            Keyboard Shortcuts
          </h2>
          <p className="text-xs text-foreground-muted">Power-user keys for rapid navigation</p>
        </div>
      </div>

      <div className="mt-5 flex flex-col divide-y divide-border/60">
        {SHORTCUTS.map((shortcut) => (
          <div
            key={shortcut.description}
            className="flex items-center justify-between py-2.5 text-xs"
          >
            <span className="font-medium text-foreground-muted">{shortcut.description}</span>
            <div className="flex items-center gap-1">
              {shortcut.keys.map((key) => (
                <kbd
                  key={key}
                  className="min-w-6 rounded border border-border bg-surface-muted px-2 py-1 text-center font-mono text-2xs font-bold text-foreground shadow-2xs"
                >
                  {key}
                </kbd>
              ))}
            </div>
          </div>
        ))}
      </div>
    </DialogSurface>
  );
}
