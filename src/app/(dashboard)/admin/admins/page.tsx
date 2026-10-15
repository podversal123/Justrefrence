import { getT } from "@/i18n/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/server/auth/session";
import { listAdmins } from "@/server/repositories/admin-repository";
import { listRoles } from "@/server/repositories/role-repository";
import { CreateAdminDialog } from "./create-admin-dialog";
import { AdminsTable } from "./admins-table";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Admins") };
}

export default async function AdminsPage() {
  const t = await getT();
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("user:read")) redirect("/unauthorized");

  const [admins, roles] = await Promise.all([listAdmins(), listRoles()]);
  const canCreate = session.permissions.has("user:create");
  const assignableRoles = roles.filter((r) => r.code !== "VENDOR" && r.code !== "CUSTOMER");

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1>{t("Admins")}</h1>
          <p className="text-muted-foreground">
            {t("Staff accounts: Super Admin, Admin, Finance, Support.")}
          </p>
        </div>
        {canCreate ? <CreateAdminDialog roles={assignableRoles} /> : null}
      </div>

      <AdminsTable admins={admins} />
    </div>
  );
}
