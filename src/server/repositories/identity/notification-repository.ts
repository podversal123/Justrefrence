import "server-only";
import { prisma } from "@/server/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { NotificationChannel } from "@/generated/prisma/enums";

export interface CreateNotificationInput {
  userId: string;
  type: string;
  payload: Prisma.InputJsonObject;
  channel?: NotificationChannel;
}

export async function createNotification(input: CreateNotificationInput) {
  return prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      payload: input.payload,
      channel: input.channel ?? "IN_APP",
    },
  });
}

const RECENT_NOTIFICATION_LIMIT = 20;

export async function listRecentNotifications(userId: string) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: RECENT_NOTIFICATION_LIMIT,
  });
}

export async function countUnreadNotifications(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function markNotificationRead(userId: string, notificationId: string) {
  return prisma.notification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllNotificationsRead(userId: string) {
  return prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}
