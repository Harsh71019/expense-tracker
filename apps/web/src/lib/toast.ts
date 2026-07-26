import type { ReactNode } from "react";
import { toast as sonnerToast, type ExternalToast } from "sonner";

type ToastId = string | number;
type ToastTitle = ReactNode | (() => ReactNode);
type PromiseToastResult<T> = ReactNode | ((value: T) => ReactNode);
type PromiseToastError = ReactNode | ((error: unknown) => ReactNode);

export type PromiseToastMessages<T> = Readonly<{
  loading: ReactNode;
  success: PromiseToastResult<T>;
  error: PromiseToastError;
  description?: PromiseToastResult<T>;
}>;

const DURATION_MS = {
  success: 4_000,
  info: 5_000,
  warning: 7_000,
  error: 8_000
} as const;

function withDuration(options: ExternalToast | undefined, duration: number): ExternalToast {
  return { ...options, duration: options?.duration ?? duration };
}

/**
 * Application toast facade.
 *
 * Feature code uses this module instead of importing Sonner directly so
 * timing, accessibility, deduplication IDs, and a future vendor swap remain
 * centralized. Field validation stays inline beside its field; toasts are for
 * operation-level outcomes and background feedback.
 */
export const toast = {
  success(title: ToastTitle, options?: ExternalToast): ToastId {
    return sonnerToast.success(title, withDuration(options, DURATION_MS.success));
  },
  info(title: ToastTitle, options?: ExternalToast): ToastId {
    return sonnerToast.info(title, withDuration(options, DURATION_MS.info));
  },
  warning(title: ToastTitle, options?: ExternalToast): ToastId {
    return sonnerToast.warning(title, withDuration(options, DURATION_MS.warning));
  },
  error(title: ToastTitle, options?: ExternalToast): ToastId {
    return sonnerToast.error(title, withDuration(options, DURATION_MS.error));
  },
  loading(title: ToastTitle, options?: ExternalToast): ToastId {
    return sonnerToast.loading(title, options);
  },
  promise<T>(task: Promise<T> | (() => Promise<T>), messages: PromiseToastMessages<T>): void {
    void sonnerToast.promise(task, messages);
  },
  dismiss(id?: ToastId): ToastId {
    return sonnerToast.dismiss(id);
  }
} as const;
