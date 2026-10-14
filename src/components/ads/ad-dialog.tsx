"use client";

import {
  BannerDialog,
  type BannerDialogOptions,
  type EditableBanner,
} from "@/app/(dashboard)/admin/banners/banner-dialog";
import { msg } from "@/i18n/locales";
import { createAdAction, updateAdAction } from "@/server/services/ad-actions";

const AD_OPTIONS: BannerDialogOptions = {
  noun: "ad",
  createAction: createAdAction,
  updateAction: updateAdAction,
  description: msg(
    "Shown in the Sponsored section on the home page once the team approves it. Any change you make later goes back for approval.",
  ),
  photoHint: msg("A clear photo at least 600px across. JPEG, PNG or WebP, up to 4 MB."),
  savedMessage: msg("It will show on the home page after the team approves it."),
};

/** A vendor adds an ad, or edits one. The form is the same as a home page banner's. */
export function AdDialog({ ad }: { ad?: EditableBanner }) {
  return <BannerDialog banner={ad} options={AD_OPTIONS} />;
}
