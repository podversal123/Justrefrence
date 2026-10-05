import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/server/auth/session";
import { getSiteSettingsFresh } from "@/server/lib/site-settings";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/status-badge";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };

export default async function AdminSettingsPage() {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("settings:read")) redirect("/unauthorized");

  const canEdit = session.permissions.has("settings:update");
  const settings = await getSiteSettingsFresh();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1>Settings</h1>
          <p className="text-muted-foreground">Website maintenance and public contact details.</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Website is</span>
          <StatusBadge status={settings.maintenanceEnabled ? "SUSPENDED" : "ACTIVE"} />
          <span className="font-medium">
            {settings.maintenanceEnabled ? "in maintenance" : "live"}
          </span>
        </div>
      </div>

      {canEdit ? null : (
        <Alert>
          <AlertDescription>
            You can view these settings, but only a Super Admin can change them.
          </AlertDescription>
        </Alert>
      )}

      <SettingsForm settings={settings} canEdit={canEdit} />
    </div>
  );
}
