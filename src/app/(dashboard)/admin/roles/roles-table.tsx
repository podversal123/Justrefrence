import { getT } from "@/i18n/server";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";

export interface RoleRow {
  id: string;
  code: string;
  label: string;
  isSystem: boolean;
  _count: { userRoles: number };
}

export async function RolesTable({ roles }: { roles: RoleRow[] }) {
  const t = await getT();
  if (roles.length === 0) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title={t("No roles")}
        description={t("There are no roles to show yet.")}
      />
    );
  }

  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Role")}</TableHead>
              <TableHead>{t("Code")}</TableHead>
              <TableHead>{t("Type")}</TableHead>
              <TableHead>{t("Assigned to")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map((role) => (
              <TableRow key={role.id}>
                <TableCell className="font-medium">
                  <Link href={`/admin/roles/${role.id}`} className="hover:underline">
                    {t(role.label)}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground font-mono text-xs">
                  {role.code}
                </TableCell>
                <TableCell>
                  <Badge variant={role.isSystem ? "secondary" : "outline"}>
                    {role.isSystem ? t("System") : t("Custom")}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {t("{count} user(s)", { count: role._count.userRoles })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-3 md:hidden">
        {roles.map((role) => (
          <Link
            key={role.id}
            href={`/admin/roles/${role.id}`}
            className="hover:bg-muted/40 block rounded-lg border p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{t(role.label)}</p>
                <p className="text-muted-foreground font-mono text-xs">{role.code}</p>
              </div>
              <Badge variant={role.isSystem ? "secondary" : "outline"}>
                {role.isSystem ? t("System") : t("Custom")}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-2 text-xs">
              {t("{count} user(s) assigned", { count: role._count.userRoles })}
            </p>
          </Link>
        ))}
      </div>
    </>
  );
}
