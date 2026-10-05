import "server-only";
import { getRequirementById, listBidRows } from "@/server/repositories/bidding/bidding-repository";
import { closeIfExpired } from "@/server/domain/bidding/bidding-service";
import {
  buildRequirementView,
  type RequirementViewModel,
  type ViewerContext,
} from "@/server/domain/bidding/view";
import type { AuthSession } from "@/server/auth/session";

/** Maps a (possibly missing) session onto the viewer shape the privacy rules need. */
export function viewerFromSession(session: AuthSession | null): ViewerContext {
  return {
    userId: session?.userId ?? null,
    vendorProfileId: session?.vendorProfileId ?? null,
    // bid:read:any is held only by staff roles (admin / super admin).
    isStaff: Boolean(session?.permissions.has("bid:read:any")),
  };
}

/**
 * Loads a requirement and the bids THIS viewer is allowed to know about.
 * Also persists OPEN -> CLOSED lazily the first time anyone looks at an
 * expired requirement, so the stored status catches up without a cron job.
 */
export async function loadRequirementView(
  requirementId: string,
  viewer: ViewerContext,
  now = new Date(),
) {
  const requirement = await getRequirementById(requirementId);
  if (!requirement) return null;
  if (requirement.status === "OPEN" && requirement.closesAt.getTime() <= now.getTime()) {
    await closeIfExpired(requirementId, now);
  }
  const bids = await listBidRows(requirementId);
  const view: RequirementViewModel = buildRequirementView({ requirement, bids, viewer, now });
  return { requirement, view, now };
}
