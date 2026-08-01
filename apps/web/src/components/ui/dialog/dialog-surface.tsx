"use client";

import { useEffect, useRef } from "react";
import type { MouseEvent, ReactNode, RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])'
].join(",");
const dialogStack: symbol[] = [];

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true"
  );
}

function useDialogBehavior(onClose: () => void): RefObject<HTMLDivElement | null> {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const dialogIdRef = useRef(Symbol("dialog"));

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const dialogId = dialogIdRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogStack.push(dialogId);

    const initialTarget = dialog === null ? undefined : focusableElements(dialog)[0];
    (initialTarget ?? dialog)?.focus();

    function handleKeyDown(event: KeyboardEvent): void {
      if (dialogStack.at(-1) !== dialogId) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || dialog === null) return;

      const focusable = focusableElements(dialog);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first === undefined || last === undefined) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const stackIndex = dialogStack.lastIndexOf(dialogId);
      if (stackIndex !== -1) dialogStack.splice(stackIndex, 1);
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return dialogRef;
}

type DialogSurfaceProps = Readonly<{
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
  variant?: "dialog" | "drawer";
  role?: "dialog" | "alertdialog";
  panelClassName?: string;
}>;

export function DialogSurface({
  labelledBy,
  onClose,
  children,
  variant = "dialog",
  role = "dialog",
  panelClassName = ""
}: DialogSurfaceProps): ReactNode {
  const dialogRef = useDialogBehavior(onClose);
  const drawer = variant === "drawer";

  function closeFromBackdrop(event: MouseEvent<HTMLDivElement>): void {
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <div
      role="presentation"
      onMouseDown={closeFromBackdrop}
      className={`fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fade-in ${
        drawer
          ? "flex justify-end"
          : "grid items-start justify-items-center overflow-y-auto overscroll-contain p-4 sm:items-center sm:p-6"
      }`}
    >
      <div
        ref={dialogRef}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`${
          drawer
            ? "safe-area-bottom h-dvh w-full max-w-md overflow-y-auto overscroll-contain border-l border-border bg-surface-elevated px-5 pt-5 outline-none animate-drawer-in sm:p-7"
            : "max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto overscroll-contain rounded-2xl border border-border bg-surface-elevated p-5 shadow-glow-strong outline-none animate-scale-up sm:p-7"
        } ${panelClassName}`}
      >
        {children}
      </div>
    </div>
  );
}
