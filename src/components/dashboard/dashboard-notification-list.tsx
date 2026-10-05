"use client";

import { useActionState, useEffect, useRef } from "react";
import { BellOff, Check, CheckCheck } from "lucide-react";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/server/services/notification-actions";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import type { ApiResult } from "@/lib/api-response";

/**
 * Presentational notification list for the customer dashboard card. Reuses
 * the BellNotification data shape / `type.replace(/_/g, " ")` label
 * fallback convention from notification-bell.tsx, but is its own markup —
 * that component is tightly coupled to the header dropdown and not meant
 * to be reused directly here.
 */
export interface DashboardNotification {
  id: string;
  type: string;
  readAt: Date | null;
  createdAt: Date;
}

const TYPE_LABELS: Record<string, string> = {
  WELCOME: "Welcome to Justreference",
  BIRTHDAY_GREETING: "Happy birthday from Justreference!",
};

function describe(notification: DashboardNotification): string {
  return TYPE_LABELS[notification.type] ?? notification.type.replace(/_/g, " ").toLowerCase();
}

const nullState: ApiResult<null> = { success: true, data: null, meta: { requestId: "" } };

/** Fires a toast exactly once per completed action dispatch, keyed on the envelope's requestId. */
function useActionToast(state: ApiResult<null>, successMessage: string, errorTitle: string) {
  const lastRequestId = useRef(state.meta.requestId);
  useEffect(() => {
    if (!state.meta.requestId || state.meta.requestId === lastRequestId.current) return;
    lastRequestId.current = state.meta.requestId;
    if (state.success) {
      toast.success(successMessage);
    } else {
      toast.error(errorTitle, state.error.message);
    }
  }, [state, successMessage, errorTitle]);
}

function MarkReadButton({ notificationId }: { notificationId: string }) {
  const [state, action] = useActionState(markNotificationReadAction, nullState);
  useActionToast(state, "Notification marked as read", "Couldn't mark as read");

  return (
    <form action={action}>
      <input type="hidden" name="notificationId" value={notificationId} />
      <Button
        type="submit"
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground"
        aria-label="Mark notification as read"
      >
        <Check className="size-3.5" />
      </Button>
    </form>
  );
}

function MarkAllReadButton() {
  const [state, action] = useActionState(markAllNotificationsReadAction, nullState);
  useActionToast(state, "All notifications marked as read", "Couldn't mark all as read");

  return (
    <form action={action}>
      <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground">
        <CheckCheck className="size-3.5" />
        Mark all read
      </Button>
    </form>
  );
}

export function DashboardNotificationList({
  notifications,
  unreadCount,
}: {
  notifications: DashboardNotification[];
  unreadCount: number;
}) {
  if (notifications.length === 0) {
    return (
      <EmptyState
        icon={BellOff}
        title="No notifications yet"
        description="We'll let you know here when something needs your attention."
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {unreadCount > 0 ? (
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-xs">
            {unreadCount} unread notification{unreadCount === 1 ? "" : "s"}
          </p>
          <MarkAllReadButton />
        </div>
      ) : null}
      <ul className="flex flex-col divide-y">
        {notifications.map((notification) => (
          <li key={notification.id} className="flex items-start justify-between gap-3 py-3 first:pt-0">
            <div className="flex min-w-0 items-start gap-2">
              <span
                className={notification.readAt ? "mt-1.5 size-1.5 shrink-0" : "bg-primary mt-1.5 size-1.5 shrink-0 rounded-full"}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className={notification.readAt ? "text-muted-foreground text-sm" : "text-sm font-medium"}>
                  {describe(notification)}
                </p>
                <p className="text-muted-foreground text-xs">{notification.createdAt.toLocaleString("en-IN")}</p>
              </div>
            </div>
            {!notification.readAt ? <MarkReadButton notificationId={notification.id} /> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
