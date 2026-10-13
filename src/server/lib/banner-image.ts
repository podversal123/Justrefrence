import "server-only";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { ValidationError } from "@/server/lib/errors";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "@/lib/upload-limits";

/**
 * Banner photo upload. The file is checked from its real bytes (not the type the browser claims),
 * re-encoded to a web-sized JPEG (which also drops any hidden metadata or embedded script), and stored
 * in the public bucket, since a homepage photo has to be viewable by everyone.
 */

const BUCKET = "catalog-public";
const MAX_WIDTH = 2000;
const MIN_WIDTH = 1200;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function uploadBannerImage(file: File): Promise<string> {
  if (file.size === 0) throw new ValidationError("Choose a photo for the banner.");
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ValidationError(`The photo is too large. Use one up to ${MAX_UPLOAD_LABEL}.`);
  }
  if (!ALLOWED.has(file.type)) throw new ValidationError("Use a JPEG, PNG or WebP photo.");

  const input = Buffer.from(await file.arrayBuffer());
  let meta;
  try {
    meta = await sharp(input).metadata();
  } catch {
    throw new ValidationError("That file is not a valid photo.");
  }
  if (
    !meta.width ||
    !meta.height ||
    !meta.format ||
    !["jpeg", "png", "webp"].includes(meta.format)
  ) {
    throw new ValidationError("The file's contents don't match its type. Pick it again.");
  }
  if (meta.width < MIN_WIDTH) {
    throw new ValidationError(
      `The photo is too small (${meta.width}px wide). Use one at least ${MIN_WIDTH}px wide so it looks sharp.`,
    );
  }

  const jpeg = await sharp(input)
    .rotate()
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();

  const path = `banners/${randomUUID()}.jpg`;
  const { error } = await createAdminClient()
    .storage.from(BUCKET)
    .upload(path, jpeg, { contentType: "image/jpeg", upsert: false });
  if (error) throw new Error(`Banner upload failed: ${error.message}`);
  return path;
}

/** A leftover photo is harmless, so a failed delete is the caller's to log, not to fail on. */
export async function deleteBannerImage(path: string): Promise<void> {
  await createAdminClient().storage.from(BUCKET).remove([path]);
}
