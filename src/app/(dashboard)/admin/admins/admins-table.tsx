import { getFormat, getT } from "@/i18n/server";
import { StatusBadge } from "@/components/ui/status-badge";
import Link from "next/link";
import { UserCog } from "lucide-react";
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

export interface AdminRow {
  id: string;
  email: string;
  fullName: string | null;
  status: string;
  createdAt: Date;
  userRoles: { id: string; role: { code: string; label: string } }[];
}

export async function AdminsTable({ admins }: { admins: AdminRow[] }) {
  const t = await getT();
  const { formatDate } = await getFormat();
  if (admins.length === 0) {
    return (
      <EmptyState
        icon={UserCog}
        title={t("No admin accounts yet")}
        description={t("Create the first admin, finance, or support account to get started.")}
      />
    );
  }

  return (
    <>
      {/* Desktop: table. Mobile: stacked cards — see docs/architecture.md UI principles. */}
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Name")}</TableHead>
              <TableHead>{t("Email")}</TableHead>
              <TableHead>{t("Roles")}</TableHead>
              <TableHead>{t("Status")}</TableHead>
              <TableHead>{t("Created")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {admins.map((admin) => (
              <TableRow key={admin.id}>
                <TableCell className="font-medium">
                  <Link href={`/admin/admins/${admin.id}`} className="hover:underline">
                    {admin.fullName ?? "—"}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{admin.email}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {admin.userRoles.map((ur) => (
                      <Badge key={ur.id} variant="secondary">
                        {t(ur.role.label)}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={admin.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(admin.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-3 md:hidden">
        {admins.map((admin) => (
          <Link
            key={admin.id}
            href={`/admin/admins/${admin.id}`}
            className="hover:bg-muted/40 block rounded-lg border p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{admin.fullName ?? "—"}</p>
                <p className="text-muted-foreground text-sm">{admin.email}</p>
              </div>
              <StatusBadge status={admin.status} />
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              {admin.userRoles.map((ur) => (
                <Badge key={ur.id} variant="secondary">
                  {t(ur.role.label)}
                </Badge>
              ))}
            </div>
            <p className="text-muted-foreground mt-2 text-xs">
              {t("Created {date}", { date: formatDate(admin.createdAt) })}
            </p>
          </Link>
        ))}
      </div>
    </>
  );
}
