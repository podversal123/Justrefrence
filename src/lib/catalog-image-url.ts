const CATALOG_BUCKET = "catalog-public";

/**
 * Client-safe counterpart to src/server/lib/image-upload.ts's
 * catalogImagePublicUrl — uses only the public Supabase URL (no service
 * role key), so it's safe to import from Client Components.
 */
export function catalogImagePublicUrlClient(storagePath: string): string {
  const base = process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "";
  return `${base}/storage/v1/object/public/${CATALOG_BUCKET}/${storagePath}`;
}
