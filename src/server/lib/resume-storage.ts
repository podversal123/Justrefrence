import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Private résumé storage. The bucket is not public: a file is only ever opened through a signed URL that
 * expires in minutes, created after an authorization check (src/app/api/resumes/[id]/file/route.ts), and
 * it is sent as a download, never shown inside the site. Same approach as kyc-storage.ts.
 */

const RESUME_BUCKET = "resumes-private";
const SIGNED_URL_EXPIRY_SECONDS = 5 * 60;

export async function uploadResumeFile(
  storagePath: string,
  bytes: Buffer,
  contentType: string,
): Promise<void> {
  const { error } = await createAdminClient()
    .storage.from(RESUME_BUCKET)
    .upload(storagePath, bytes, { contentType, upsert: false });
  if (error) throw new Error(`Résumé upload failed: ${error.message}`);
}

export async function removeResumeFile(storagePath: string): Promise<void> {
  const { error } = await createAdminClient().storage.from(RESUME_BUCKET).remove([storagePath]);
  if (error) throw new Error(`Could not remove the résumé file: ${error.message}`);
}

/** `downloadName` makes the browser save the file instead of trying to open it. */
export async function getResumeSignedUrl(
  storagePath: string,
  downloadName: string,
): Promise<string> {
  const { data, error } = await createAdminClient()
    .storage.from(RESUME_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SECONDS, { download: downloadName });
  if (error || !data) throw new Error(`Could not open the résumé: ${error?.message}`);
  return data.signedUrl;
}
