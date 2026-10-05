import type { Metadata, Route } from "next";
import Link from "next/link";
import { Newspaper } from "lucide-react";
import { listPublishedPosts } from "@/server/repositories/content/blog-repository";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "News and updates",
  description: "News, announcements and updates from Justreference.",
};

// Published posts change rarely; re-check at most once a minute.
export const revalidate = 60;

export default async function BlogIndexPage() {
  let posts: Awaited<ReturnType<typeof listPublishedPosts>> = [];
  let failed = false;
  try {
    posts = await listPublishedPosts();
  } catch (error) {
    console.error("[blog] failed to load posts", error);
    failed = true;
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12">
      <h1 className="mb-1">News and updates</h1>
      <p className="text-muted-foreground mb-8">What&apos;s new at Justreference.</p>

      {failed ? (
        <ErrorState description="We couldn't load the blog right now." />
      ) : posts.length === 0 ? (
        <EmptyState
          icon={Newspaper}
          title="No posts yet"
          description="We haven't published anything yet. Check back soon."
        />
      ) : (
        <ul className="divide-y">
          {posts.map((post) => (
            <li key={post.id} className="py-6">
              <Link href={`/blog/${post.slug}` as Route} className="group block space-y-1">
                <h2 className="text-xl group-hover:underline">{post.title}</h2>
                {post.publishedAt ? (
                  <p className="text-muted-foreground text-xs">{formatDate(post.publishedAt)}</p>
                ) : null}
                {post.excerpt ? (
                  <p className="text-muted-foreground text-sm">{post.excerpt}</p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
