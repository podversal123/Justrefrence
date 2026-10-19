"use client";

import { useT } from "@/i18n/provider";
import Link from "next/link";
import type { Route } from "next";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { ActionForm } from "@/components/ui/action-form";
import { updateSiteSettingsAction } from "@/server/services/settings-actions";
import type { SiteSettings } from "@/server/lib/site-settings";

export function SettingsForm({ settings, canEdit }: { settings: SiteSettings; canEdit: boolean }) {
  const t = useT();
  return (
    <ActionForm
      action={updateSiteSettingsAction}
      submitLabel={t("Save settings")}
      pendingLabel={t("Saving…")}
      successMessage={t("Settings saved")}
      resetOnSuccess={false}
    >
      {(errors) => (
        <fieldset disabled={!canEdit} className="space-y-8">
          <section className="space-y-4">
            <div>
              <h2 className="text-base font-semibold">{t("Website maintenance")}</h2>
              <p className="text-muted-foreground text-sm">
                {t(
                  "When on, visitors, members and vendors see a maintenance notice instead of the site. Staff accounts keep full access, and payments and scheduled jobs keep running.",
                )}
              </p>
            </div>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                name="maintenanceEnabled"
                defaultChecked={settings.maintenanceEnabled}
                className="mt-0.5 size-4"
              />
              <span>
                <span className="font-medium">{t("Put the website in maintenance mode")}</span>
                <span className="text-muted-foreground block text-xs">
                  {t("Sign-in stays available so your team can get in.")}
                </span>
              </span>
            </label>
            <FormField
              htmlFor="st-message"
              label={t("Message shown to visitors")}
              hint={t("Optional. A default message is used if this is empty.")}
              error={errors["maintenanceMessage"]}
            >
              <Textarea
                id="st-message"
                name="maintenanceMessage"
                rows={3}
                maxLength={500}
                defaultValue={settings.maintenanceMessage}
              />
            </FormField>
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-base font-semibold">{t("Two-step login for staff")}</h2>
              <p className="text-muted-foreground text-sm">
                {t(
                  "When on, every Admin, Finance, Support and Super Admin account must enter a code from an authenticator app after signing in. Staff who have not set it up are taken to set it up first.",
                )}
              </p>
            </div>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                name="staffTwoStepRequired"
                defaultChecked={settings.staffTwoStepRequired}
                className="mt-0.5 size-4"
              />
              <span>
                <span className="font-medium">{t("Require two-step login for staff")}</span>
                <span className="text-muted-foreground block text-xs">
                  {t(
                    "To switch this on you must first turn on your own two-step login and enter a code in this session.",
                  )}{" "}
                  <Link href={"/two-step" as Route} className="underline underline-offset-4">
                    {t("Open the Two-step login page")}
                  </Link>
                </span>
              </span>
            </label>
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-base font-semibold">{t("Auto logout")}</h2>
              <p className="text-muted-foreground text-sm">
                {t("Signed-in users are logged out after this many minutes without any activity.")}
              </p>
            </div>
            <FormField
              htmlFor="st-idle"
              label={t("Minutes before auto logout")}
              hint={t("Use 0 to turn auto logout off. Otherwise 5 to 1440.")}
              error={errors["idleLogoutMinutes"]}
            >
              <Input
                id="st-idle"
                name="idleLogoutMinutes"
                type="number"
                inputMode="numeric"
                min={0}
                max={1440}
                className="w-40"
                defaultValue={settings.idleLogoutMinutes}
              />
            </FormField>
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-base font-semibold">{t("Contact details")}</h2>
              <p className="text-muted-foreground text-sm">
                {t("Shown on the public Contact page. Leave a field empty to hide it.")}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField htmlFor="st-email" label={t("Email")} error={errors["contactEmail"]}>
                <Input
                  id="st-email"
                  name="contactEmail"
                  type="email"
                  maxLength={120}
                  defaultValue={settings.contactEmail}
                />
              </FormField>
              <FormField htmlFor="st-phone" label={t("Phone")} error={errors["contactPhone"]}>
                <Input
                  id="st-phone"
                  name="contactPhone"
                  type="tel"
                  maxLength={30}
                  defaultValue={settings.contactPhone}
                />
              </FormField>
            </div>
            <FormField
              htmlFor="st-address"
              label={t("Office address")}
              error={errors["contactAddress"]}
            >
              <Textarea
                id="st-address"
                name="contactAddress"
                rows={3}
                maxLength={300}
                defaultValue={settings.contactAddress}
              />
            </FormField>
            <FormField
              htmlFor="st-hours"
              label={t("Working hours")}
              hint={t("For example: Monday to Saturday, 10 am to 6 pm.")}
              error={errors["contactHours"]}
            >
              <Input
                id="st-hours"
                name="contactHours"
                maxLength={120}
                defaultValue={settings.contactHours}
              />
            </FormField>
          </section>
        </fieldset>
      )}
    </ActionForm>
  );
}
