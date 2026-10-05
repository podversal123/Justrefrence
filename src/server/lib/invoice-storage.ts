import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Private invoice PDF storage — see docs/adr/0007-pdf-generation.md ("a
 * private Supabase Storage bucket, served via a signed URL to authorized
 * viewers only"). Unlike the public catalog-images bucket
 * (src/server/lib/image-upload.ts), nothing here is ever served by a
 * public/unsigned URL.
 */

const INVOICE_BUCKET = "invoices-private";
const SIGNED_URL_EXPIRY_SECONDS = 5 * 60; // 5 minutes — just enough for the browser to open the file

export async function uploadInvoicePdf(storagePath: string, pdf: Buffer): Promise<void> {
  const supabaseAdmin = createAdminClient();
  const { error } = await supabaseAdmin.storage
    .from(INVOICE_BUCKET)
    .upload(storagePath, pdf, { contentType: "application/pdf", upsert: true });

  if (error) {
    throw new Error(`Invoice PDF upload failed: ${error.message}`);
  }
}

export async function getInvoiceSignedUrl(storagePath: string): Promise<string> {
  const supabaseAdmin = createAdminClient();
  const { data, error } = await supabaseAdmin.storage
    .from(INVOICE_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SECONDS);

  if (error || !data) {
    throw new Error(`Could not create a signed URL for the invoice: ${error?.message}`);
  }

  return data.signedUrl;
}
