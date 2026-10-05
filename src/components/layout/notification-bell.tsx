"use client";

import { useActionState } from "react";
import { Bell } from "lucide-react";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/server/services/notification-actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ApiResult } from "@/lib/api-response";

export interface BellNotification {
  id: string;
  type: string;
  payload: unknown;
  readAt: Date | null;
  createdAt: Date;
}

const TYPE_LABELS: Record<string, string> = {
  WELCOME: "Welcome to Justreference",
  BIRTHDAY_GREETING: "Happy birthday from Justreference!",
  TICKET_REPLY: "New reply on your support ticket",
  TICKET_STATUS: "Your support ticket was updated",
  MESSAGE_RECEIVED: "You have a new message",
  BID_RECEIVED: "A vendor placed a bid on your requirement",
  OUTBID: "You were outbid in a reverse auction",
  BID_AWARDED: "Your bid was awarded",
  BID_NOT_SELECTED: "Your bid was not selected",
  REQUIREMENT_CANCELLED: "A requirement you bid on was cancelled",
};

function describe(notification: BellNotification): string {
  return TYPE_LABELS[notification.type] ?? notification.type.replace(/_/g, " ").toLowerCase();
}

const nullState: ApiResult<null> = { success: true, data: null, meta: { requestId: "" } };

function MarkReadButton({ notificationId }: { notificationId: string }) {
  const [, action] = useActionState(markNotificationReadAction, nullState);
  return (
    <form action={action}>
      <input type="hidden" name="notificationId" value={notificationId} />
      <button type="submit" className="w-full text-left">
        Mark read
      </button>
    </form>
  );
}

export function NotificationBell({
  notifications,
  unreadCount,
}: {
  notifications: BellNotification[];
  unreadCount: number;
}) {
  const [, markAllAction] = useActionState(markAllNotificationsReadAction, nullState);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" className="relative rounded-full">
            <Bell className="size-4" />
            {unreadCount > 0 ? (
              <Badge
                variant="destructive"
                className="absolute -top-1 -right-1 h-4 min-w-4 justify-center rounded-full px-1 text-[10px]"
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </Badge>
            ) : null}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="p-0 text-xs font-normal">Notifications</DropdownMenuLabel>
          {unreadCount > 0 ? (
            <form action={markAllAction}>
              <button type="submit" className="text-muted-foreground hover:text-foreground text-xs">
                Mark all read
              </button>
            </form>
          ) : null}
        </div>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <div className="text-muted-foreground px-2 py-6 text-center text-xs">
            No notifications yet.
          </div>
        ) : (
          notifications.map((notification) => (
            <DropdownMenuItem
              key={notification.id}
              className="flex flex-col items-start gap-0.5"
              closeOnClick={false}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className={notification.readAt ? "text-muted-foreground" : "font-medium"}>
                  {describe(notification)}
                </span>
                {!notification.readAt ? (
                  <span className="bg-primary size-1.5 rounded-full" />
                ) : null}
              </div>
              <span className="text-muted-foreground text-xs">
                {notification.createdAt.toLocaleString("en-IN")}
              </span>
              {!notification.readAt ? (
                <div className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2">
                  <MarkReadButton notificationId={notification.id} />
                </div>
              ) : null}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
