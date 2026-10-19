import { getT } from "@/i18n/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/server/auth/session";
import { getLegalTextsFresh } from "@/server/lib/legal-store";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LegalForm } from "./legal-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Legal pages") };
}

export default async function AdminLegalPage() {
  const t = await getT();
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("settings:read")) redirect("/unauthorized");

  const canEdit = session.permissions.has("settings:update");
  const texts = await getLegalTextsFresh();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1>{t("Legal pages")}</h1>
        <p className="text-muted-foreground">
          {t(
            "The Terms and Conditions, Privacy Policy and Refund Policy shown to the public. Use the wording your lawyer approved.",
          )}
        </p>
      </div>

      {canEdit ? null : (
        <Alert>
          <AlertDescription>
            {t("You can view these pages, but only a Super Admin can change them.")}
          </AlertDescription>
        </Alert>
      )}

      <LegalForm texts={texts} canEdit={canEdit} />
    </div>
  );
}
