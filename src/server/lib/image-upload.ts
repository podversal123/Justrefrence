import "server-only";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { ValidationError } from "@/server/lib/errors";

/**
 * Secure catalog image upload — see docs/file-upload.md. Images are never
 * stored as binaries in Postgres (only `storage_path` is); the actual bytes
 * go to a public Supabase Storage bucket, re-encoded server-side so the
 * stored file is never byte-identical to the upload (strips EXIF/embedded
 * scripts, normalizes format/size — neutralizes most image-polyglot attack
 * vectors by construction).
 */

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB — generous pre-optimization ceiling
const MAX_DIMENSION = 1600; // px, longest edge
const JPEG_QUALITY = 82;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const CATALOG_BUCKET = "catalog-public";

export interface UploadedImage {
  storagePath: string;
  width: number;
  height: number;
  bytes: number;
}

/**
 * Validates, re-encodes, and uploads one catalog image. Content-sniffing is
 * implicit: `sharp().metadata()` parses the actual image bytes rather than
 * trusting the browser-supplied MIME type, so a mislabeled non-image file
 * fails here rather than being trusted.
 */
export async function uploadCatalogImage(
  file: File,
  ownerType: "product" | "service" | "project",
  ownerId: string,
): Promise<UploadedImage> {
  if (file.size === 0) {
    throw new ValidationError("The selected file is empty.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ValidationError("Images must be 5MB or smaller.");
  }
  if (!ALLOWED_MIME.has(file.type)) {
    throw new ValidationError("Only JPEG, PNG, or WebP images are allowed.");
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer());

  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    metadata = await sharp(inputBuffer).metadata();
  } catch {
    throw new ValidationError("That file isn't a valid image.");
  }

  if (!metadata.width || !metadata.height) {
    throw new ValidationError("That file isn't a valid image.");
  }
  if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format)) {
    // The declared MIME type lied — the actual bytes are something else.
    throw new ValidationError("The file's contents don't match its declared type.");
  }

  const optimized = await sharp(inputBuffer)
    .rotate() // apply EXIF orientation, then EXIF itself is dropped below
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });

  const storagePath = `${ownerType}/${ownerId}/${randomUUID()}.jpg`;

  const supabaseAdmin = createAdminClient();
  const { error } = await supabaseAdmin.storage
    .from(CATALOG_BUCKET)
    .upload(storagePath, optimized.data, { contentType: "image/jpeg", upsert: false });

  if (error) {
    throw new Error(`Image upload failed: ${error.message}`);
  }

  return {
    storagePath,
    width: optimized.info.width,
    height: optimized.info.height,
    bytes: optimized.info.size,
  };
}

export async function deleteCatalogImage(storagePath: string): Promise<void> {
  const supabaseAdmin = createAdminClient();
  await supabaseAdmin.storage.from(CATALOG_BUCKET).remove([storagePath]);
}

export { catalogImagePublicUrlClient as catalogImagePublicUrl } from "@/lib/catalog-image-url";
