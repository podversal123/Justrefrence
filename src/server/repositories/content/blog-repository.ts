import "server-only";
import { prisma } from "@/server/lib/prisma";

const POST_LIST_SELECT = {
  id: true,
  title: true,
  slug: true,
  excerpt: true,
  status: true,
  publishedAt: true,
  updatedAt: true,
  author: { select: { fullName: true } },
} as const;

export async function listPublishedPosts(limit = 20) {
  return prisma.blogPost.findMany({
    where: { status: "PUBLISHED", deletedAt: null },
    orderBy: { publishedAt: "desc" },
    take: limit,
    select: POST_LIST_SELECT,
  });
}

export async function getPublishedPostBySlug(slug: string) {
  return prisma.blogPost.findFirst({
    where: { slug, status: "PUBLISHED", deletedAt: null },
    select: { ...POST_LIST_SELECT, body: true },
  });
}

export async function listAllPostsForAdmin() {
  return prisma.blogPost.findMany({
    where: { deletedAt: null },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: POST_LIST_SELECT,
  });
}

export async function getPostForEdit(id: string) {
  return prisma.blogPost.findFirst({
    where: { id, deletedAt: null },
    select: { ...POST_LIST_SELECT, body: true },
  });
}

export function slugifyTitle(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return base || "post";
}

/** Slug is unique; on collision append a short random suffix rather than failing the author. */
export async function createPost(input: {
  title: string;
  excerpt: string | null;
  body: string;
  authorId: string;
}) {
  const base = slugifyTitle(input.title);
  const taken = await prisma.blogPost.findUnique({ where: { slug: base }, select: { id: true } });
  const slug = taken ? `${base}-${Math.random().toString(36).slice(2, 7)}` : base;
  return prisma.blogPost.create({
    data: { ...input, slug },
    select: { id: true, slug: true },
  });
}

export async function updatePost(
  id: string,
  data: { title: string; excerpt: string | null; body: string },
) {
  const result = await prisma.blogPost.updateMany({ where: { id, deletedAt: null }, data });
  return result.count > 0;
}

/** Conditional so a double-click publishes once and keeps the original publish date. */
export async function publishPost(id: string) {
  const result = await prisma.blogPost.updateMany({
    where: { id, status: "DRAFT", deletedAt: null },
    data: { status: "PUBLISHED", publishedAt: new Date() },
  });
  return result.count > 0;
}

export async function unpublishPost(id: string) {
  const result = await prisma.blogPost.updateMany({
    where: { id, status: "PUBLISHED", deletedAt: null },
    data: { status: "DRAFT" },
  });
  return result.count > 0;
}

export async function softDeletePost(id: string) {
  const result = await prisma.blogPost.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return result.count > 0;
}
