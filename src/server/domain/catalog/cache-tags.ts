/**
 * Cache tag for the public catalog pages (cached lists and categories, see
 * repositories/catalog/public-cache.ts). Call `revalidateTag(CATALOG_PUBLIC_TAG, { expire: 0 })`
 * whenever a listing, category or vendor approval changes what the public can see.
 */
export const CATALOG_PUBLIC_TAG = "catalog-public";
