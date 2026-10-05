"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/server/auth/authorize";
import { getAuthSession } from "@/server/auth/session";
import {
  createPost,
  getPostForEdit,
  publishPost,
  softDeletePost,
  unpublishPost,
  updatePost,
} from "@/server/repositories/content/blog-repository";
import {
  createFeedback,
  markFeedbackReviewed,
} from "@/server/repositories/content/feedback-repository";
import { blogPostSchema, feedbackSchema } from "@/lib/schemas/support";
import { recordAudit } from "@/server/domain/audit/record";
import { ConflictError, NotFoundError, RateLimitedError } from "@/server/lib/errors";
import { clientIp, failureFrom, requestId, validationFailure } from "@/server/lib/action-helpers";
import { feedbackRateLimiter } from "@/server/lib/rate-limit";
import type { ApiResult } from "@/lib/api-response";

const TAG = "content_action_failed";

// ---------------------------------------------------------------- blog

export async function createBlogPostAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<{ postId: string }>> {
  let session;
  try {
    session = await authorize("blog:create");
  } catch (error) {
    return failureFrom(TAG, error, "You don't have permission to write blog posts.");
  }
  const parsed = blogPostSchema.safeParse({
    title: formData.get("title"),
    excerpt: formData.get("excerpt") || undefined,
    body: formData.get("body"),
  });
  if (!parsed.success) return validationFailure("Check the post fields below.", parsed.error);

  try {
    const post = await createPost({
      title: parsed.data.title,
      excerpt: parsed.data.excerpt ?? null,
      body: parsed.data.body,
      authorId: session.userId,
    });
    await recordAudit({
      actorId: session.userId,
      action: "BLOG_POST_CREATED",
      entityType: "blog_posts",
      entityId: post.id,
    });
    revalidatePath("/admin/blog");
    return { success: true, data: { postId: post.id }, meta: { requestId: requestId() } };
  } catch (error) {
    return failureFrom(TAG, error, "Could not save the post.");
  }
}

export async function updateBlogPostAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("blog:create");
  } catch (error) {
    return failureFrom(TAG, error, "You don't have permission to edit blog posts.");
  }
  const postId = String(formData.get("postId") ?? "");
  const parsed = blogPostSchema.safeParse({
    title: formData.get("title"),
    excerpt: formData.get("excerpt") || undefined,
    body: formData.get("body"),
  });
  if (!parsed.success) return validationFailure("Check the post fields below.", parsed.error);

  try {
    const existing = await getPostForEdit(postId);
    if (!existing) throw new NotFoundError("Post not found.");
    await updatePost(postId, {
      title: parsed.data.title,
      excerpt: parsed.data.excerpt ?? null,
      body: parsed.data.body,
    });
    await recordAudit({
      actorId: session.userId,
      action: "BLOG_POST_UPDATED",
      entityType: "blog_posts",
      entityId: postId,
    });
    revalidatePath("/admin/blog");
    revalidatePath(`/blog/${existing.slug}`);
    revalidatePath("/blog");
    return { success: true, data: null, meta: { requestId: requestId() } };
  } catch (error) {
    return failureFrom(TAG, error, "Could not update the post.");
  }
}

/** Publishing is its own permission (`blog:publish`) so writing and going live can be split between people. */
export async function setBlogPostPublishedAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("blog:publish");
  } catch (error) {
    return failureFrom(TAG, error, "You don't have permission to publish blog posts.");
  }
  const postId = String(formData.get("postId") ?? "");
  const publish = formData.get("publish") === "true";

  try {
    const existing = await getPostForEdit(postId);
    if (!existing) throw new NotFoundError("Post not found.");
    const changed = publish ? await publishPost(postId) : await unpublishPost(postId);
    if (!changed)
      throw new ConflictError(
        publish ? "This post is already published." : "This post is already a draft.",
      );
    await recordAudit({
      actorId: session.userId,
      action: publish ? "BLOG_POST_PUBLISHED" : "BLOG_POST_UNPUBLISHED",
      entityType: "blog_posts",
      entityId: postId,
    });
    revalidatePath("/admin/blog");
    revalidatePath("/blog");
    revalidatePath(`/blog/${existing.slug}`);
    return { success: true, data: null, meta: { requestId: requestId() } };
  } catch (error) {
    return failureFrom(TAG, error, "Could not change the post's status.");
  }
}

export async function deleteBlogPostAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("blog:publish");
  } catch (error) {
    return failureFrom(TAG, error, "You don't have permission to delete blog posts.");
  }
  const postId = String(formData.get("postId") ?? "");
  try {
    const existing = await getPostForEdit(postId);
    if (!existing) throw new NotFoundError("Post not found.");
    const removed = await softDeletePost(postId);
    if (!removed) throw new NotFoundError("Post not found.");
    await recordAudit({
      actorId: session.userId,
      action: "BLOG_POST_DELETED",
      entityType: "blog_posts",
      entityId: postId,
    });
    revalidatePath("/admin/blog");
    revalidatePath("/blog");
    // The public article page is cached (revalidate = 60) — evict it now so a
    // deleted post doesn't stay readable until the cache expires.
    revalidatePath(`/blog/${existing.slug}`);
    return { success: true, data: null, meta: { requestId: requestId() } };
  } catch (error) {
    return failureFrom(TAG, error, "Could not delete the post.");
  }
}

// ------------------------------------------------------------ feedback

/**
 * Public — no sign-in required (the existing site's "Feedback" link was
 * public). Anonymous input is untrusted: validated, rate-limited per IP,
 * stored as plain text and only ever rendered as text.
 */
export async function submitFeedbackAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  const parsed = feedbackSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    rating: formData.get("rating") || undefined,
    message: formData.get("message"),
  });
  if (!parsed.success) return validationFailure("Check the highlighted fields.", parsed.error);

  try {
    const session = await getAuthSession();
    const limit = await feedbackRateLimiter.consume(
      `feedback:${session?.userId ?? (await clientIp())}`,
    );
    if (!limit.allowed)
      throw new RateLimitedError(
        "You've sent feedback several times already. Please try again later.",
      );

    const feedback = await createFeedback({
      userId: session?.userId ?? null,
      name: parsed.data.name,
      email: parsed.data.email,
      rating: parsed.data.rating ?? null,
      message: parsed.data.message,
    });
    await recordAudit({
      actorId: session?.userId ?? null,
      action: "FEEDBACK_SUBMITTED",
      entityType: "feedbacks",
      entityId: feedback.id,
    });
    revalidatePath("/admin/feedback");
    return { success: true, data: null, meta: { requestId: requestId() } };
  } catch (error) {
    return failureFrom(TAG, error, "Could not send your feedback.");
  }
}

export async function markFeedbackReviewedAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("feedback:read");
  } catch (error) {
    return failureFrom(TAG, error, "You don't have permission to review feedback.");
  }
  const feedbackId = String(formData.get("feedbackId") ?? "");
  try {
    await markFeedbackReviewed(feedbackId);
    await recordAudit({
      actorId: session.userId,
      action: "FEEDBACK_REVIEWED",
      entityType: "feedbacks",
      entityId: feedbackId,
    });
    revalidatePath("/admin/feedback");
    return { success: true, data: null, meta: { requestId: requestId() } };
  } catch (error) {
    return failureFrom(TAG, error, "Could not update that feedback.");
  }
}
