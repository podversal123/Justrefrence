import Link from "next/link";
import { Store } from "lucide-react";
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
import type { VendorListItem } from "@/server/repositories/vendor-repository";

const STATUS_VARIANT = {
  APPROVED: "default",
  PENDING: "secondary",
  REJECTED: "destructive",
  SUSPENDED: "destructive",
} as const;

export function VendorsTable({
  vendors,
  hasActiveFilters,
}: {
  vendors: VendorListItem[];
  hasActiveFilters: boolean;
}) {
  if (vendors.length === 0) {
    return (
      <EmptyState
        icon={Store}
        title={hasActiveFilters ? "No vendors match your filters" : "No vendors yet"}
        description={
          hasActiveFilters
            ? "Try a different search term or clear the filters."
            : "Create the first vendor to get started."
        }
      />
    );
  }

  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Business</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vendors.map((vendor) => (
              <TableRow key={vendor.id} className="cursor-pointer">
                <TableCell className="font-medium">
                  <Link href={`/admin/vendors/${vendor.id}`} className="hover:underline">
                    {vendor.businessName}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <div>{vendor.fullName ?? "—"}</div>
                  <div className="text-xs">{vendor.email}</div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={STATUS_VARIANT[vendor.approvalStatus as keyof typeof STATUS_VARIANT]}
                  >
                    {vendor.approvalStatus}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {vendor.createdAt.toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-3 md:hidden">
        {vendors.map((vendor) => (
          <Link
            key={vendor.id}
            href={`/admin/vendors/${vendor.id}`}
            className="hover:bg-muted/40 rounded-lg border p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{vendor.businessName}</p>
                <p className="text-muted-foreground text-sm">{vendor.fullName ?? vendor.email}</p>
              </div>
              <Badge variant={STATUS_VARIANT[vendor.approvalStatus as keyof typeof STATUS_VARIANT]}>
                {vendor.approvalStatus}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-2 text-xs">
              Created {vendor.createdAt.toLocaleDateString()}
            </p>
          </Link>
        ))}
      </div>
    </>
  );
}
