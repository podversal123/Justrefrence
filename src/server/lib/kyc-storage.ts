import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Private KYC document storage. The bucket is not public: a file is only ever opened through a
 * signed URL that expires in minutes, created after an authorization check
 * (src/app/api/kyc/[id]/file/route.ts). Same approach as invoice-storage.ts.
 */

const KYC_BUCKET = "kyc-private";
const SIGNED_URL_EXPIRY_SECONDS = 5 * 60;

export async function uploadKycFile(
  storagePath: string,
  bytes: Buffer,
  contentType: string,
): Promise<void> {
  const { error } = await createAdminClient()
    .storage.from(KYC_BUCKET)
    .upload(storagePath, bytes, { contentType, upsert: false });
  if (error) throw new Error(`KYC upload failed: ${error.message}`);
}

/** Best effort: a leftover file in a private bucket is harmless, so a failure here is only logged by the caller. */
export async function removeKycFile(storagePath: string): Promise<void> {
  await createAdminClient().storage.from(KYC_BUCKET).remove([storagePath]);
}

export async function getKycSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await createAdminClient()
    .storage.from(KYC_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SECONDS);
  if (error || !data) throw new Error(`Could not open the document: ${error?.message}`);
  return data.signedUrl;
}
