import "server-only";
import { prisma } from "@/server/lib/prisma";

export async function createFeedback(input: {
  userId: string | null;
  name: string;
  email: string;
  rating: number | null;
  message: string;
}) {
  return prisma.feedback.create({ data: input, select: { id: true } });
}

export async function listFeedback() {
  return prisma.feedback.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      name: true,
      email: true,
      rating: true,
      message: true,
      reviewedAt: true,
      createdAt: true,
      user: { select: { id: true } },
    },
  });
}

export async function markFeedbackReviewed(id: string) {
  const result = await prisma.feedback.updateMany({
    where: { id, reviewedAt: null },
    data: { reviewedAt: new Date() },
  });
  return result.count > 0;
}
