import "server-only";
import { prisma } from "@/server/lib/prisma";

export interface NewResumeInput {
  fullName: string;
  email: string;
  phone: string | null;
  position: string;
  message: string | null;
  fileName: string;
  storagePath: string;
  fileSize: number;
  contentType: string;
}

export function createResume(input: NewResumeInput) {
  return prisma.resumeSubmission.create({ data: input });
}

/** The newest résumés, with only what the admin list shows (no storage path). */
export function listRecentResumes(limit = 100) {
  return prisma.resumeSubmission.findMany({
    orderBy: [{ createdAt: "desc" }],
    take: limit,
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      position: true,
      message: true,
      fileName: true,
      fileSize: true,
      status: true,
      createdAt: true,
    },
  });
}

export function countNewResumes() {
  return prisma.resumeSubmission.count({ where: { status: "NEW" } });
}

export function getResumeForDownload(id: string) {
  return prisma.resumeSubmission.findUnique({
    where: { id },
    select: { id: true, storagePath: true, fileName: true, position: true },
  });
}

export function getResumeForDelete(id: string) {
  return prisma.resumeSubmission.findUnique({
    where: { id },
    select: { id: true, storagePath: true, position: true },
  });
}

/** Marks a résumé reviewed (by whom, and when) or puts it back to new. Returns how many rows matched. */
export async function setResumeStatus(
  id: string,
  status: "NEW" | "REVIEWED",
  reviewerUserId: string,
): Promise<number> {
  const result = await prisma.resumeSubmission.updateMany({
    where: { id },
    data:
      status === "REVIEWED"
        ? { status: "REVIEWED", reviewedBy: reviewerUserId, reviewedAt: new Date() }
        : { status: "NEW", reviewedBy: null, reviewedAt: null },
  });
  return result.count;
}

export function deleteResume(id: string) {
  return prisma.resumeSubmission.delete({ where: { id } });
}
