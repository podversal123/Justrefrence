"use client";

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
  const router = useRouter();
  if (!canPublish) {
    return (
      <p className="text-muted-foreground text-sm">You can edit drafts but not publish them.</p>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      <ConfirmationDialog
        trigger={<Button>{published ? "Unpublish" : "Publish"}</Button>}
        title={published ? "Unpublish this post?" : "Publish this post?"}
        description={
          published
            ? "It disappears from the public blog and goes back to draft."
            : "It becomes visible to everyone on the public blog."
        }
        action={setBlogPostPublishedAction}
        hiddenFields={{ postId, publish: published ? "false" : "true" }}
        confirmLabel={published ? "Unpublish" : "Publish"}
        successMessage={published ? "Post unpublished" : "Post published"}
      />
      <ConfirmationDialog
        trigger={<Button variant="outline">Delete</Button>}
        title="Delete this post?"
        description="It is removed from the blog and the admin list."
        action={async (prev, formData) => {
          const result = await deleteBlogPostAction(prev, formData);
          if (result.success) router.push("/admin/blog" as Route);
          return result;
        }}
        hiddenFields={{ postId }}
        confirmLabel="Delete post"
        successMessage="Post deleted"
        variant="destructive"
      />
    </div>
  );
}
