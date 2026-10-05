/**
 * Pure ownership check — see docs/adr/0011 and the Phase 3 brief's "do not
 * allow a vendor to manage another vendor's listings" requirement.
 *
 * `product:update` (etc.) is held by both ADMIN/SUPER_ADMIN (unscoped —
 * they manage the whole catalog) and VENDOR (scoped to their own listings
 * only) — see docs/rbac.md §4. The permission alone can't distinguish these
 * two cases, so ownership is decided by whether the caller has their OWN
 * vendor profile at all: if they do, they're restricted to it; if they
 * don't, the permission check already established they're staff.
 */
export function canManageListing(
  callerVendorProfileId: string | null,
  listingVendorId: string,
): boolean {
  if (callerVendorProfileId === null) return true; // staff (admin/finance/support-with-grant)
  return callerVendorProfileId === listingVendorId;
}
