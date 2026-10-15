import { getFormat, getT } from "@/i18n/server";
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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Blog") };
}

export default async function AdminBlogPage() {
  const t = await getT();
  const { formatDate } = await getFormat();
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
          {t("New post")}
        </Link>
      }
    />
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1>{t("Blog")}</h1>
          <p className="text-muted-foreground">{t("News and updates shown on the public blog.")}</p>
        </div>
        {newButton}
      </div>

      {posts.length === 0 ? (
        <EmptyState
          icon={Newspaper}
          title={t("No posts yet")}
          description={t("Write your first post. It stays a draft until you publish it.")}
          action={newButton}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Title")}</TableHead>
              <TableHead>{t("Status")}</TableHead>
              <TableHead>{t("Published")}</TableHead>
              <TableHead>{t("Last edited")}</TableHead>
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
