import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import { getPostForEdit } from "@/server/repositories/content/blog-repository";
import { StatusBadge } from "@/components/ui/status-badge";
import { BlogForm } from "../blog-form";
import { PostActions } from "../post-actions";

export const metadata: Metadata = { title: "Edit blog post" };

export default async function EditBlogPostPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("blog:create")) redirect("/unauthorized");

  const { id } = await params;
  const post = await getPostForEdit(id).catch(() => null);
  if (!post) notFound();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link
        href="/admin/blog"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" />
        All posts
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1>Edit post</h1>
          <StatusBadge status={post.status} />
        </div>
        {post.status === "PUBLISHED" ? (
          <Link
            href={`/blog/${post.slug}` as Route}
            className="text-primary inline-flex items-center gap-1 text-sm hover:underline"
          >
            View on site
            <ExternalLink className="size-4" />
          </Link>
        ) : null}
      </div>
      <PostActions
        postId={post.id}
        published={post.status === "PUBLISHED"}
        canPublish={session.permissions.has("blog:publish")}
      />
      <BlogForm post={{ id: post.id, title: post.title, excerpt: post.excerpt, body: post.body }} />
    </div>
  );
}
