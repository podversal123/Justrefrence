import { getFormat, getT } from "@/i18n/server";
import { StatusBadge } from "@/components/ui/status-badge";
import Link from "next/link";
import { Store } from "lucide-react";
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

export async function VendorsTable({
  vendors,
  hasActiveFilters,
}: {
  vendors: VendorListItem[];
  hasActiveFilters: boolean;
}) {
  const t = await getT();
  const { formatDate } = await getFormat();
  if (vendors.length === 0) {
    return (
      <EmptyState
        icon={Store}
        title={hasActiveFilters ? t("No vendors match your filters") : t("No vendors yet")}
        description={
          hasActiveFilters
            ? t("Try a different search term or clear the filters.")
            : t("Create the first vendor to get started.")
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
              <TableHead>{t("Business")}</TableHead>
              <TableHead>{t("Contact")}</TableHead>
              <TableHead>{t("Status")}</TableHead>
              <TableHead>{t("Created")}</TableHead>
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
                  <StatusBadge status={vendor.approvalStatus} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(vendor.createdAt)}
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
              <StatusBadge status={vendor.approvalStatus} />
            </div>
            <p className="text-muted-foreground mt-2 text-xs">
              {t("Created {date}", { date: formatDate(vendor.createdAt) })}
            </p>
          </Link>
        ))}
      </div>
    </>
  );
}
