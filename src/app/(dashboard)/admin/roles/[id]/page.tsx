import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getAuthSession } from "@/server/auth/session";
import { getRoleDetail } from "@/server/repositories/role-repository";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Users } from "lucide-react";
import { RolePermissionEditor } from "./role-permission-editor";

export const metadata: Metadata = { title: "Role details" };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function RoleDetailPage({ params }: PageProps) {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("role:read")) redirect("/unauthorized");

  const { id } = await params;
  const role = await getRoleDetail(id);
  if (!role) notFound();

  const canEdit = session.permissions.has("permission:update");
  const currentPermissionCodes = role.rolePermissions.map((rp) => rp.permission.code);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>{role.label}</h1>
          <p className="text-muted-foreground font-mono text-sm">{role.code}</p>
        </div>
        <Badge variant={role.isSystem ? "secondary" : "outline"}>
          {role.isSystem ? "System role" : "Custom role"}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Permissions</CardTitle>
          <CardDescription>
            {canEdit
              ? "Changes apply to every user who holds this role, immediately."
              : "You don't have permission to edit role permissions."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RolePermissionEditor
            roleId={role.id}
            currentPermissionCodes={currentPermissionCodes}
            readOnly={!canEdit}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assigned users ({role.userRoles.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {role.userRoles.length === 0 ? (
            <EmptyState icon={Users} title="No one holds this role yet" />
          ) : (
            <ul className="divide-y">
              {role.userRoles.map((ur) => (
                <li key={ur.userId} className="flex justify-between py-2 text-sm">
                  <span>{ur.user.fullName ?? ur.user.email}</span>
                  <span className="text-muted-foreground">{ur.user.email}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
