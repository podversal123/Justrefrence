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

const STATUS_VARIANT = {
  ACTIVE: "default",
  PENDING_VERIFICATION: "secondary",
  BLOCKED: "destructive",
} as const;

export function AdminsTable({ admins }: { admins: AdminRow[] }) {
  if (admins.length === 0) {
    return (
      <EmptyState
        icon={UserCog}
        title="No admin accounts yet"
        description="Create the first admin, finance, or support account to get started."
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
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
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
                        {ur.role.label}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[admin.status as keyof typeof STATUS_VARIANT]}>
                    {admin.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {admin.createdAt.toLocaleDateString()}
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
              <Badge variant={STATUS_VARIANT[admin.status as keyof typeof STATUS_VARIANT]}>
                {admin.status}
              </Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              {admin.userRoles.map((ur) => (
                <Badge key={ur.id} variant="secondary">
                  {ur.role.label}
                </Badge>
              ))}
            </div>
            <p className="text-muted-foreground mt-2 text-xs">
              Created {admin.createdAt.toLocaleDateString()}
            </p>
          </Link>
        ))}
      </div>
    </>
  );
}
