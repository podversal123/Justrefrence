import "server-only";
import { prisma } from "@/server/lib/prisma";
import type { Panel } from "@/server/auth/panel";

const SELECT = {
  id: true,
  title: true,
  body: true,
  audience: true,
  status: true,
  createdAt: true,
  publishedAt: true,
} as const;

export function listAllAnnouncements() {
  return prisma.announcement.findMany({
    select: SELECT,
    orderBy: [{ createdAt: "desc" }],
    take: 100,
  });
}

/** Published notices for a panel's dashboard. Staff see everything that has been published. */
export function listPublishedFor(panel: Panel, limit = 3) {
  const audiences =
    panel === "CUSTOMER"
      ? (["ALL", "CUSTOMERS"] as const)
      : panel === "VENDOR"
        ? (["ALL", "VENDORS"] as const)
        : (["ALL", "CUSTOMERS", "VENDORS"] as const);
  return prisma.announcement.findMany({
    where: { status: "PUBLISHED", audience: { in: [...audiences] } },
    select: SELECT,
    orderBy: [{ publishedAt: "desc" }],
    take: limit,
  });
}

export function getAnnouncement(id: string) {
  return prisma.announcement.findUnique({ where: { id }, select: SELECT });
}
