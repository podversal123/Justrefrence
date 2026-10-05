import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/server/auth/session";
import { listRoles } from "@/server/repositories/role-repository";
import { RolesTable } from "./roles-table";
import { CreateRoleDialog } from "./create-role-dialog";

export const metadata: Metadata = { title: "Roles & permissions" };

export default async function RolesPage() {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("role:read")) redirect("/unauthorized");

  const roles = await listRoles();
  const canCreate = session.permissions.has("permission:update");

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1>Roles & permissions</h1>
          <p className="text-muted-foreground">
            The 6 system roles plus any custom roles your team has created.
          </p>
        </div>
        {canCreate ? <CreateRoleDialog /> : null}
      </div>

      <RolesTable roles={roles} />
    </div>
  );
}
