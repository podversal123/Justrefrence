"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/server/auth/authorize";
import { prisma } from "@/server/lib/prisma";
import { announcementFieldsSchema, announcementIdSchema } from "@/lib/schemas/announcement";
import { getAnnouncement } from "@/server/repositories/content/announcement-repository";
import { recordAudit } from "@/server/domain/audit/record";
import { NotFoundError, ValidationError } from "@/server/lib/errors";
import { failureFrom, requestId, validationFailure } from "@/server/lib/action-helpers";
import type { ApiResult } from "@/lib/api-response";

/**
 * Announcements to members. A Super Admin's notice is published at once; an Admin's notice waits
 * for a Super Admin (the same two-step rule as other Admin changes).
 */

export interface AnnouncementOutcome {
  mode: "PUBLISHED" | "SUBMITTED";
}

const ok = <T>(data: T): ApiResult<T> => ({
  success: true,
  data,
  meta: { requestId: requestId() },
});

function refresh() {
  revalidatePath("/dashboard");
  revalidatePath("/admin/announcements");
}

export async function createAnnouncementAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<AnnouncementOutcome>> {
  let session;
  try {
    session = await authorize("announcement:manage");
  } catch (error) {
    return failureFrom(
      "announcement_denied",
      error,
      "You don't have permission to send announcements.",
    );
  }
  const parsed = announcementFieldsSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
    audience: formData.get("audience"),
  });
  if (!parsed.success) return validationFailure("Check the fields below.", parsed.error);

  try {
    const direct = session.permissions.has("change:apply_direct");
    const created = await prisma.announcement.create({
      data: {
        ...parsed.data,
        status: direct ? "PUBLISHED" : "PENDING",
        createdBy: session.userId,
        ...(direct ? { publishedBy: session.userId, publishedAt: new Date() } : {}),
      },
      select: { id: true },
    });
    await recordAudit({
      actorId: session.userId,
      action: direct ? "ANNOUNCEMENT_PUBLISHED" : "ANNOUNCEMENT_SUBMITTED",
      entityType: "announcements",
      entityId: created.id,
      after: { title: parsed.data.title, audience: parsed.data.audience },
    });
    refresh();
    return ok<AnnouncementOutcome>({ mode: direct ? "PUBLISHED" : "SUBMITTED" });
  } catch (error) {
    return failureFrom("announcement_create_failed", error, "Could not save the announcement.");
  }
}

/** Super Admin only: publish a waiting notice. Conditional update so two clicks cannot publish twice. */
export async function publishAnnouncementAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("change:review");
  } catch (error) {
    return failureFrom("announcement_denied", error, "Only a Super Admin can publish this.");
  }
  try {
    const id = announcementIdSchema.parse(formData.get("id"));
    const result = await prisma.announcement.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "PUBLISHED", publishedBy: session.userId, publishedAt: new Date() },
    });
    if (result.count === 0) throw new ValidationError("This announcement was already handled.");
    await recordAudit({
      actorId: session.userId,
      action: "ANNOUNCEMENT_PUBLISHED",
      entityType: "announcements",
      entityId: id,
    });
    refresh();
    return ok(null);
  } catch (error) {
    return failureFrom("announcement_publish_failed", error, "Could not publish the announcement.");
  }
}

/** Takes a notice off the dashboards (or turns down a waiting one). The record is kept. */
export async function archiveAnnouncementAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("announcement:manage");
  } catch (error) {
    return failureFrom("announcement_denied", error, "You don't have permission to do this.");
  }
  try {
    const id = announcementIdSchema.parse(formData.get("id"));
    const existing = await getAnnouncement(id);
    if (!existing) throw new NotFoundError("Announcement not found.");
    // Only a Super Admin may withdraw a notice that is already live to members.
    if (existing.status === "PUBLISHED" && !session.permissions.has("change:apply_direct")) {
      throw new ValidationError("Only a Super Admin can take down a published announcement.");
    }
    await prisma.announcement.update({ where: { id }, data: { status: "ARCHIVED" } });
    await recordAudit({
      actorId: session.userId,
      action: "ANNOUNCEMENT_ARCHIVED",
      entityType: "announcements",
      entityId: id,
    });
    refresh();
    return ok(null);
  } catch (error) {
    return failureFrom("announcement_archive_failed", error, "Could not remove the announcement.");
  }
}
