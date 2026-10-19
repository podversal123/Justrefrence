import { getT } from "@/i18n/server";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getAuthSession } from "@/server/auth/session";
import { getAdminById } from "@/server/repositories/admin-repository";
import { listRoles } from "@/server/repositories/role-repository";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RoleManager } from "@/components/admin/role-manager";
import { countTwoStepFactors } from "@/server/lib/two-step-admin";
import { ResetTwoStepButton } from "./reset-two-step-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Admin details") };
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminDetailPage({ params }: PageProps) {
  const t = await getT();
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("user:read")) redirect("/unauthorized");

  const { id } = await params;
  const admin = await getAdminById(id);
  if (!admin) notFound();

  const roles = await listRoles();
  const canResetTwoStep = session.permissions.has("two_step:reset") && admin.id !== session.userId;
  // Only a Super Admin sees this, and only that person's status is looked up.
  const twoStepOn = canResetTwoStep
    ? (await countTwoStepFactors(admin.id).catch(() => 0)) > 0
    : false;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>{admin.fullName ?? admin.email}</h1>
          <p className="text-muted-foreground">{admin.email}</p>
        </div>
        <StatusBadge status={admin.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("Roles")}</CardTitle>
          <CardDescription>{t("What this account can do.")}</CardDescription>
        </CardHeader>
        <CardContent>
          {session.permissions.has("role:assign") ? (
            <RoleManager userId={admin.id} currentGrants={admin.userRoles} allRoles={roles} />
          ) : (
            <div className="flex flex-wrap gap-2">
              {admin.userRoles.map((ur) => (
                <Badge key={ur.id} variant="secondary">
                  {ur.role.label}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {canResetTwoStep ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("Two-step login")}</CardTitle>
            <CardDescription>
              {twoStepOn
                ? t("This account uses an authenticator app. Reset it if they lost their phone.")
                : t("This account has not set up two-step login.")}
            </CardDescription>
          </CardHeader>
          {twoStepOn ? (
            <CardContent>
              <ResetTwoStepButton userId={admin.id} />
            </CardContent>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
