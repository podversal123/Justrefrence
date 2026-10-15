"use client";

import { useT } from "@/i18n/provider";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { ActionForm } from "@/components/ui/action-form";
import { createBlogPostAction, updateBlogPostAction } from "@/server/services/content-actions";

interface PostValues {
  id: string;
  title: string;
  excerpt: string | null;
  body: string;
}

/** Create (no `post`) or edit (`post`) a blog post. Body is plain text; blank lines separate paragraphs. */
export function BlogForm({ post }: { post?: PostValues }) {
  const t = useT();
  const router = useRouter();
  const fields = (errors: Record<string, string[] | undefined>) => (
    <>
      {post ? <input type="hidden" name="postId" value={post.id} /> : null}
      <FormField htmlFor="post-title" label={t("Title")} error={errors["title"]}>
        <Input id="post-title" name="title" defaultValue={post?.title} maxLength={160} required />
      </FormField>
      <FormField
        htmlFor="post-excerpt"
        label={t("Short summary")}
        hint={t("Shown on the blog list. Optional.")}
        error={errors["excerpt"]}
      >
        <Input
          id="post-excerpt"
          name="excerpt"
          defaultValue={post?.excerpt ?? ""}
          maxLength={300}
        />
      </FormField>
      <FormField
        htmlFor="post-body"
        label={t("Post")}
        hint={t("Plain text. Leave a blank line between paragraphs.")}
        error={errors["body"]}
      >
        <Textarea
          id="post-body"
          name="body"
          defaultValue={post?.body}
          rows={14}
          maxLength={40000}
          required
        />
      </FormField>
    </>
  );

  return post ? (
    <ActionForm
      action={updateBlogPostAction}
      submitLabel={t("Save changes")}
      pendingLabel={t("Saving…")}
      successMessage={t("Post saved")}
      resetOnSuccess={false}
    >
      {fields}
    </ActionForm>
  ) : (
    <ActionForm
      action={createBlogPostAction}
      submitLabel={t("Save draft")}
      pendingLabel={t("Saving…")}
      successMessage={t("Draft saved")}
      onSuccess={(data) => router.push(`/admin/blog/${data.postId}` as Route)}
    >
      {fields}
    </ActionForm>
  );
}
