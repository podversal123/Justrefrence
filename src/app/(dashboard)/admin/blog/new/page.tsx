import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import { BlogForm } from "../blog-form";

export const metadata: Metadata = { title: "New blog post" };

export default async function NewBlogPostPage() {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("blog:create")) redirect("/unauthorized");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link
        href="/admin/blog"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" />
        All posts
      </Link>
      <h1>New post</h1>
      <BlogForm />
    </div>
  );
}
