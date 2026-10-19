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
import { createClient } from "@/lib/supabase/server";
import { ValidationError } from "@/server/lib/errors";
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
    idleLogoutMinutes: formData.get("idleLogoutMinutes") ?? undefined,
    staffTwoStepRequired: formData.get("staffTwoStepRequired") ?? undefined,
    walletPaymentEnabled: formData.get("walletPaymentEnabled") ?? undefined,
  });
  if (!parsed.success) return validationFailure("Check the highlighted settings.", parsed.error);

  try {
    const before = await getSiteSettingsFresh();
    // Requiring two-step for staff is only switched on by someone who has just proved theirs works,
    // so a broken set-up can never lock the whole team out.
    if (parsed.data.staffTwoStepRequired && !before.staffTwoStepRequired) {
      const supabase = await createClient();
      const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (level?.currentLevel !== "aal2") {
        throw new ValidationError(
          "Turn on and enter your own two-step code first (Two-step login page), then switch this on.",
        );
      }
    }
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
