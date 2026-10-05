"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { ActionForm } from "@/components/ui/action-form";
import { updateSiteSettingsAction } from "@/server/services/settings-actions";
import type { SiteSettings } from "@/server/lib/site-settings";

export function SettingsForm({ settings, canEdit }: { settings: SiteSettings; canEdit: boolean }) {
  return (
    <ActionForm
      action={updateSiteSettingsAction}
      submitLabel="Save settings"
      pendingLabel="Saving…"
      successMessage="Settings saved"
      resetOnSuccess={false}
    >
      {(errors) => (
        <fieldset disabled={!canEdit} className="space-y-8">
          <section className="space-y-4">
            <div>
              <h2 className="text-base font-semibold">Website maintenance</h2>
              <p className="text-muted-foreground text-sm">
                When on, visitors, members and vendors see a maintenance notice instead of the site.
                Staff accounts keep full access, and payments and scheduled jobs keep running.
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
                <span className="font-medium">Put the website in maintenance mode</span>
                <span className="text-muted-foreground block text-xs">
                  Sign-in stays available so your team can get in.
                </span>
              </span>
            </label>
            <FormField
              htmlFor="st-message"
              label="Message shown to visitors"
              hint="Optional. A default message is used if this is empty."
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
              <h2 className="text-base font-semibold">Contact details</h2>
              <p className="text-muted-foreground text-sm">
                Shown on the public Contact page. Leave a field empty to hide it.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField htmlFor="st-email" label="Email" error={errors["contactEmail"]}>
                <Input
                  id="st-email"
                  name="contactEmail"
                  type="email"
                  maxLength={120}
                  defaultValue={settings.contactEmail}
                />
              </FormField>
              <FormField htmlFor="st-phone" label="Phone" error={errors["contactPhone"]}>
                <Input
                  id="st-phone"
                  name="contactPhone"
                  type="tel"
                  maxLength={30}
                  defaultValue={settings.contactPhone}
                />
              </FormField>
            </div>
            <FormField htmlFor="st-address" label="Office address" error={errors["contactAddress"]}>
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
              label="Working hours"
              hint="For example: Monday to Saturday, 10 am to 6 pm."
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
