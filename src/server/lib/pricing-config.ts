import "server-only";
import { prisma } from "@/server/lib/prisma";

/**
 * Reads the admin-configurable commerce rates from `system_settings` — "the
 * confirmed configuration" the Phase 5 brief refers to. Seeded with
 * documented placeholder defaults (prisma/seed.ts) pending
 * docs/business-rules.md Q-19 (GST)/Q-20 (platform fee); if a key is
 * somehow missing even the seed, the in-code DEFAULT below is used rather
 * than crashing checkout — never 0 by accident, always an explicit,
 * documented fallback.
 */

export const GST_RATE_SETTING_KEY = "commerce.gst_rate_bps";
export const PLATFORM_FEE_RATE_SETTING_KEY = "commerce.platform_fee_rate_bps";

/** 18% — the standard GST slab for most goods/services, pending Q-19's category-specific confirmation. */
const DEFAULT_GST_RATE_BPS = 1800;
/** 5% — placeholder only, pending Q-20's commercial rate decision. */
const DEFAULT_PLATFORM_FEE_RATE_BPS = 500;

async function readBpsSetting(key: string, fallback: number): Promise<number> {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  if (!row || typeof row.valueJson !== "number") return fallback;
  return row.valueJson;
}

export interface PricingConfig {
  gstRateBps: number;
  platformFeeRateBps: number;
}

export async function getPricingConfig(): Promise<PricingConfig> {
  const [gstRateBps, platformFeeRateBps] = await Promise.all([
    readBpsSetting(GST_RATE_SETTING_KEY, DEFAULT_GST_RATE_BPS),
    readBpsSetting(PLATFORM_FEE_RATE_SETTING_KEY, DEFAULT_PLATFORM_FEE_RATE_BPS),
  ]);
  return { gstRateBps, platformFeeRateBps };
}
