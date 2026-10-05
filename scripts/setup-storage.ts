/**
 * Creates the Supabase Storage buckets the app expects (idempotent):
 *
 *   catalog-public    PUBLIC   product/service/project images (image-upload.ts)
 *   invoices-private  PRIVATE  invoice PDFs, served only via short-lived signed URLs (invoice-storage.ts)
 *
 * A fresh Supabase project has neither, and the failures are quiet: image
 * uploads error with "Bucket not found" and invoice PDFs silently never get
 * stored. Run once per Supabase project (and after resetting one):
 *
 *   npx tsx scripts/setup-storage.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
import { createClient } from "@supabase/supabase-js";

const BUCKETS = [
  {
    name: "catalog-public",
    options: {
      public: true,
      fileSizeLimit: 5 * 1024 * 1024,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    },
  },
  {
    name: "invoices-private",
    options: {
      public: false,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ["application/pdf"],
    },
  },
] as const;

async function main() {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key)
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env.");
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  for (const bucket of BUCKETS) {
    const existing = await supabase.storage.getBucket(bucket.name);
    if (!existing.error) {
      console.log(`ok       ${bucket.name} (already exists, public=${existing.data.public})`);
      continue;
    }
    const created = await supabase.storage.createBucket(bucket.name, {
      ...bucket.options,
      allowedMimeTypes: [...bucket.options.allowedMimeTypes],
    });
    if (created.error)
      throw new Error(`Could not create "${bucket.name}": ${created.error.message}`);
    console.log(`created  ${bucket.name} (public=${bucket.options.public})`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
