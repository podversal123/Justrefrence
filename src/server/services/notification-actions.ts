"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/server/repositories/identity/notification-repository";
import type { ApiResult } from "@/lib/api-response";

/**
 * Notification-bell actions — see docs/notifications.md. Reads happen
 * directly in Server Components (site-header.tsx); these actions cover the
 * two mutations (mark one read, mark all read), always scoped to the
 * caller's own session.
 */

function requestId() {
  return crypto.randomUUID();
}

async function requireUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function markNotificationReadAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  const userId = await requireUserId();
  if (!userId) {
    return {
      success: false,
      error: { code: "UNAUTHENTICATED", message: "Please sign in again." },
      meta: { requestId: requestId() },
    };
  }

  const notificationId = String(formData.get("notificationId") ?? "");
  if (!notificationId) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Missing notification id." },
      meta: { requestId: requestId() },
    };
  }

  await markNotificationRead(userId, notificationId);
  revalidatePath("/dashboard");
  return { success: true, data: null, meta: { requestId: requestId() } };
}

export async function markAllNotificationsReadAction(
  _prevState: unknown,
  _formData: FormData,
): Promise<ApiResult<null>> {
  const userId = await requireUserId();
  if (!userId) {
    return {
      success: false,
      error: { code: "UNAUTHENTICATED", message: "Please sign in again." },
      meta: { requestId: requestId() },
    };
  }

  await markAllNotificationsRead(userId);
  revalidatePath("/dashboard");
  return { success: true, data: null, meta: { requestId: requestId() } };
}
