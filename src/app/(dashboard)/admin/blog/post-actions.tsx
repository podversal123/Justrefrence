"use client";

import { useT } from "@/i18n/provider";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  deleteBlogPostAction,
  setBlogPostPublishedAction,
} from "@/server/services/content-actions";

/** Publish / unpublish / delete controls for one post. Publishing needs blog:publish (checked server-side too). */
export function PostActions({
  postId,
  published,
  canPublish,
}: {
  postId: string;
  published: boolean;
  canPublish: boolean;
}) {
  const t = useT();
  const router = useRouter();
  if (!canPublish) {
    return (
      <p className="text-muted-foreground text-sm">
        {t("You can edit drafts but not publish them.")}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      <ConfirmationDialog
        trigger={<Button>{published ? t("Unpublish") : t("Publish")}</Button>}
        title={published ? t("Unpublish this post?") : t("Publish this post?")}
        description={
          published
            ? t("It disappears from the public blog and goes back to draft.")
            : t("It becomes visible to everyone on the public blog.")
        }
        action={setBlogPostPublishedAction}
        hiddenFields={{ postId, publish: published ? "false" : "true" }}
        confirmLabel={published ? t("Unpublish") : t("Publish")}
        successMessage={published ? t("Post unpublished") : t("Post published")}
      />
      <ConfirmationDialog
        trigger={<Button variant="outline">{t("Delete")}</Button>}
        title={t("Delete this post?")}
        description={t("It is removed from the blog and the admin list.")}
        action={async (prev, formData) => {
          const result = await deleteBlogPostAction(prev, formData);
          if (result.success) router.push("/admin/blog" as Route);
          return result;
        }}
        hiddenFields={{ postId }}
        confirmLabel={t("Delete post")}
        successMessage={t("Post deleted")}
        variant="destructive"
      />
    </div>
  );
}
