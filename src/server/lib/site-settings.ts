import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@/server/lib/prisma";
import type { AuthSession } from "@/server/auth/session";
import type { SiteSettingsInput } from "@/lib/schemas/settings";

/**
 * Admin-editable site settings, stored as rows in `system_settings`
 * (same table the commerce rates use). Reads are cached for 30s and the
 * cache is evicted the moment an admin saves, so toggling maintenance mode
 * takes effect immediately without every page view hitting the database.
 */

export const SITE_SETTINGS_TAG = "site-settings";

const KEYS = {
  maintenanceEnabled: { key: "site.maintenance_enabled", type: "BOOLEAN" },
  maintenanceMessage: { key: "site.maintenance_message", type: "STRING" },
  contactEmail: { key: "site.contact_email", type: "STRING" },
  contactPhone: { key: "site.contact_phone", type: "STRING" },
  contactAddress: { key: "site.contact_address", type: "STRING" },
  contactHours: { key: "site.contact_hours", type: "STRING" },
} as const;

export interface SiteSettings {
  maintenanceEnabled: boolean;
  maintenanceMessage: string;
  contactEmail: string;
  contactPhone: string;
  contactAddress: string;
  contactHours: string;
}

export const DEFAULT_MAINTENANCE_MESSAGE =
  "We're making some improvements and will be back shortly. Thank you for your patience.";

const DEFAULTS: SiteSettings = {
  maintenanceEnabled: false,
  maintenanceMessage: "",
  contactEmail: "",
  contactPhone: "",
  contactAddress: "",
  contactHours: "",
};

async function readSettings(): Promise<SiteSettings> {
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: Object.values(KEYS).map((k) => k.key) } },
    select: { key: true, valueJson: true },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.valueJson]));
  const text = (key: string) =>
    typeof byKey.get(key) === "string" ? (byKey.get(key) as string) : "";
  return {
    maintenanceEnabled: byKey.get(KEYS.maintenanceEnabled.key) === true,
    maintenanceMessage: text(KEYS.maintenanceMessage.key),
    contactEmail: text(KEYS.contactEmail.key),
    contactPhone: text(KEYS.contactPhone.key),
    contactAddress: text(KEYS.contactAddress.key),
    contactHours: text(KEYS.contactHours.key),
  };
}

const readSettingsCached = unstable_cache(readSettings, ["site-settings"], {
  revalidate: 30,
  tags: [SITE_SETTINGS_TAG],
});

/**
 * Never throws: if the settings can't be read (database hiccup) the site
 * keeps serving normally with maintenance OFF rather than locking everyone
 * out because of a failed settings lookup.
 */
export async function getSiteSettings(): Promise<SiteSettings> {
  try {
    return await readSettingsCached();
  } catch {
    return DEFAULTS;
  }
}

/** Uncached read for the admin form, so an editor always sees what is really stored. */
export async function getSiteSettingsFresh(): Promise<SiteSettings> {
  return readSettings();
}

export async function saveSiteSettings(input: SiteSettingsInput, actorId: string): Promise<void> {
  const values: Record<keyof typeof KEYS, string | boolean> = {
    maintenanceEnabled: input.maintenanceEnabled,
    maintenanceMessage: input.maintenanceMessage,
    contactEmail: input.contactEmail,
    contactPhone: input.contactPhone,
    contactAddress: input.contactAddress,
    contactHours: input.contactHours,
  };
  await prisma.$transaction(
    (Object.keys(KEYS) as (keyof typeof KEYS)[]).map((name) =>
      prisma.systemSetting.upsert({
        where: { key: KEYS[name].key },
        update: { valueJson: values[name], valueType: KEYS[name].type, updatedBy: actorId },
        create: {
          key: KEYS[name].key,
          valueJson: values[name],
          valueType: KEYS[name].type,
          updatedBy: actorId,
        },
      }),
    ),
  );
}

/**
 * Who may keep using the site while maintenance mode is on: any staff
 * account, so the team can still check and finish the work. Everyone else
 * (visitors, members, vendors) sees the maintenance notice. This is a UI
 * gate — payment webhooks and scheduled jobs deliberately keep running.
 */
const STAFF_ROLES = new Set(["SUPER_ADMIN", "ADMIN", "FINANCE", "SUPPORT"]);

export function canBypassMaintenance(session: Pick<AuthSession, "roles"> | null): boolean {
  return Boolean(session?.roles.some((role) => STAFF_ROLES.has(role)));
}
