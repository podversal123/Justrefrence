import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getPublishedPostBySlug } from "@/server/repositories/content/blog-repository";
import { formatDate } from "@/lib/format";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug).catch(() => null);
  if (!post) return { title: "Post not found" };
  return { title: post.title, description: post.excerpt ?? undefined };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug).catch(() => null);
  if (!post) notFound();

  // Plain text only: paragraphs split on blank lines and rendered as text
  // nodes — post bodies are never interpreted as HTML.
  const paragraphs = post.body
    .split(/\r?\n[ \t]*\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <article className="mx-auto w-full max-w-2xl px-4 py-12">
      <Link
        href="/blog"
        className="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" />
        All posts
      </Link>
      <h1 className="mb-2">{post.title}</h1>
      <p className="text-muted-foreground mb-8 text-sm">
        {post.publishedAt ? formatDate(post.publishedAt) : null}
        {post.author.fullName ? ` · ${post.author.fullName}` : null}
      </p>
      <div className="space-y-4 leading-relaxed">
        {paragraphs.map((paragraph, i) => (
          <p key={i} className="whitespace-pre-line">
            {paragraph}
          </p>
        ))}
      </div>
    </article>
  );
}
