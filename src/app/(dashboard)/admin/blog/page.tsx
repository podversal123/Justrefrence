import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Newspaper, Plus } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import { listAllPostsForAdmin } from "@/server/repositories/content/blog-repository";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Blog" };

export default async function AdminBlogPage() {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("blog:create")) redirect("/unauthorized");

  const posts = await listAllPostsForAdmin();
  const newButton = (
    <Button
      nativeButton={false}
      render={
        <Link href={"/admin/blog/new" as Route}>
          <Plus />
          New post
        </Link>
      }
    />
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1>Blog</h1>
          <p className="text-muted-foreground">News and updates shown on the public blog.</p>
        </div>
        {newButton}
      </div>

      {posts.length === 0 ? (
        <EmptyState
          icon={Newspaper}
          title="No posts yet"
          description="Write your first post. It stays a draft until you publish it."
          action={newButton}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Published</TableHead>
              <TableHead>Last edited</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {posts.map((post) => (
              <TableRow key={post.id}>
                <TableCell>
                  <Link
                    href={`/admin/blog/${post.id}` as Route}
                    className="font-medium hover:underline"
                  >
                    {post.title}
                  </Link>
                </TableCell>
                <TableCell>
                  <StatusBadge status={post.status} />
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {post.publishedAt ? formatDate(post.publishedAt) : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {formatDate(post.updatedAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
