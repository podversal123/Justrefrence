"use client";

import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import { CheckCircle2, Info, TriangleAlert, XCircle, X } from "lucide-react";
import { cn } from "cn";

/*
 * The app's "success state" / inline-feedback primitive (Phase 10 brief:
 * every screen needs a success state, and none of the Phase 1-9 primitives
 * covered it — EmptyState/ErrorState/ConfirmationDialog did not). Built on
 * Base UI's Toast (already a dependency via @base-ui/react) rather than
 * adding sonner or another package.
 *
 * `toastManager` is a module-level singleton so server actions and plain
 * event handlers can call `toast.success(...)` without needing the
 * `useToastManager()` hook — mirrors sonner's imperative `toast()` API.
 */
export const toastManager = ToastPrimitive.createToastManager();

type ToastKind = "success" | "error" | "warning" | "info";

function add(type: ToastKind, title: string, description?: string) {
  return toastManager.add({ type, title, description });
}

export const toast = {
  success: (title: string, description?: string) => add("success", title, description),
  error: (title: string, description?: string) => add("error", title, description),
  warning: (title: string, description?: string) => add("warning", title, description),
  info: (title: string, description?: string) => add("info", title, description),
};

const TOAST_ICON: Record<ToastKind, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  warning: TriangleAlert,
  info: Info,
};

const TOAST_TONE: Record<ToastKind, string> = {
  success: "text-success",
  error: "text-destructive",
  warning: "text-warning",
  info: "text-info",
};

function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <ToastPrimitive.Provider toastManager={toastManager} timeout={5000}>
      {children}
      <Toaster />
    </ToastPrimitive.Provider>
  );
}

function Toaster() {
  const { toasts } = ToastPrimitive.useToastManager();

  return (
    <ToastPrimitive.Portal>
      <ToastPrimitive.Viewport className="fixed bottom-4 left-1/2 z-50 mx-auto flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4 sm:bottom-6 sm:left-auto sm:right-6 sm:translate-x-0">
        {toasts.map((toastItem) => {
          const type = (toastItem.type as ToastKind | undefined) ?? "info";
          const Icon = TOAST_ICON[type];
          return (
            <ToastPrimitive.Root
              key={toastItem.id}
              toast={toastItem}
              className={cn(
                "shadow-overlay-lg data-[swiping]:transition-none data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom-2 relative flex items-start gap-3 rounded-xl border bg-card p-4 transition-[transform,opacity] duration-150",
              )}
            >
              <Icon className={cn("mt-0.5 size-5 shrink-0", TOAST_TONE[type])} aria-hidden="true" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <ToastPrimitive.Title className="text-card-foreground text-sm font-medium" />
                <ToastPrimitive.Description className="text-muted-foreground text-sm" />
              </div>
              <ToastPrimitive.Close
                className="text-muted-foreground hover:text-foreground -m-1 flex size-7 shrink-0 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                aria-label="Dismiss notification"
              >
                <X className="size-4" />
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          );
        })}
      </ToastPrimitive.Viewport>
    </ToastPrimitive.Portal>
  );
}

export { ToastProvider };
