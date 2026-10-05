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

export function RolesTable({ roles }: { roles: RoleRow[] }) {
  if (roles.length === 0) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="No roles"
        description="This shouldn't happen — the seed script creates 6 system roles."
      />
    );
  }

  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Role</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Assigned to</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map((role) => (
              <TableRow key={role.id}>
                <TableCell className="font-medium">
                  <Link href={`/admin/roles/${role.id}`} className="hover:underline">
                    {role.label}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground font-mono text-xs">
                  {role.code}
                </TableCell>
                <TableCell>
                  <Badge variant={role.isSystem ? "secondary" : "outline"}>
                    {role.isSystem ? "System" : "Custom"}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {role._count.userRoles} user(s)
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
                <p className="font-medium">{role.label}</p>
                <p className="text-muted-foreground font-mono text-xs">{role.code}</p>
              </div>
              <Badge variant={role.isSystem ? "secondary" : "outline"}>
                {role.isSystem ? "System" : "Custom"}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-2 text-xs">
              {role._count.userRoles} user(s) assigned
            </p>
          </Link>
        ))}
      </div>
    </>
  );
}
