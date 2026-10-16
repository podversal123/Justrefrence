import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Private storage for documents a member sends to the team with a message. The bucket is not public:
 * a file is only opened through a signed link that expires in minutes, made after a check on who is
 * asking (src/app/api/messages/[id]/attachment/route.ts). Same approach as kyc-storage.ts.
 */

const BUCKET = "message-docs";
const SIGNED_URL_EXPIRY_SECONDS = 5 * 60;

export async function uploadMessageDoc(
  storagePath: string,
  bytes: Buffer,
  contentType: string,
): Promise<void> {
  const { error } = await createAdminClient()
    .storage.from(BUCKET)
    .upload(storagePath, bytes, { contentType, upsert: false });
  if (error) throw new Error(`Document upload failed: ${error.message}`);
}

/** Best effort: a leftover file in a private bucket is harmless, so the caller only logs a failure. */
export async function removeMessageDoc(storagePath: string): Promise<void> {
  await createAdminClient().storage.from(BUCKET).remove([storagePath]);
}

export async function getMessageDocSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await createAdminClient()
    .storage.from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SECONDS);
  if (error || !data) throw new Error(`Could not open the document: ${error?.message}`);
  return data.signedUrl;
}
