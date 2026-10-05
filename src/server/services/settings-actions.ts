"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { authorize } from "@/server/auth/authorize";
import {
  getSiteSettingsFresh,
  saveSiteSettings,
  SITE_SETTINGS_TAG,
} from "@/server/lib/site-settings";
import { siteSettingsSchema } from "@/lib/schemas/settings";
import { recordAudit } from "@/server/domain/audit/record";
import { failureFrom, requestId, validationFailure } from "@/server/lib/action-helpers";
import type { ApiResult } from "@/lib/api-response";

const TAG = "settings_action_failed";

export async function updateSiteSettingsAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("settings:update");
  } catch (error) {
    return failureFrom(TAG, error, "You don't have permission to change settings.");
  }

  const parsed = siteSettingsSchema.safeParse({
    maintenanceEnabled: formData.get("maintenanceEnabled") ?? undefined,
    maintenanceMessage: formData.get("maintenanceMessage") ?? undefined,
    contactEmail: formData.get("contactEmail") ?? undefined,
    contactPhone: formData.get("contactPhone") ?? undefined,
    contactAddress: formData.get("contactAddress") ?? undefined,
    contactHours: formData.get("contactHours") ?? undefined,
  });
  if (!parsed.success) return validationFailure("Check the highlighted settings.", parsed.error);

  try {
    const before = await getSiteSettingsFresh();
    await saveSiteSettings(parsed.data, session.userId);
    await recordAudit({
      actorId: session.userId,
      action:
        before.maintenanceEnabled !== parsed.data.maintenanceEnabled
          ? parsed.data.maintenanceEnabled
            ? "MAINTENANCE_MODE_ENABLED"
            : "MAINTENANCE_MODE_DISABLED"
          : "SITE_SETTINGS_UPDATED",
      entityType: "system_settings",
      entityId: "site",
      before: { ...before },
      after: { ...parsed.data },
    });
    // Expire immediately (not stale-while-revalidate): turning maintenance on/off must apply to the next request.
    revalidateTag(SITE_SETTINGS_TAG, { expire: 0 });
    revalidatePath("/contact");
    revalidatePath("/admin/settings");
    return { success: true, data: null, meta: { requestId: requestId() } };
  } catch (error) {
    return failureFrom(TAG, error, "Could not save the settings.");
  }
}
