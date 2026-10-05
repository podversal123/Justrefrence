import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Package, Plus } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import { getCatalogRepository } from "@/server/repositories/catalog/registry";
import { catalogListQuerySchema } from "@/lib/schemas/catalog";
import {
  CATALOG_LABELS,
  CATALOG_PERMISSIONS,
  kindFromRouteSegment,
} from "@/server/domain/catalog/types";
import { formatPaise } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { SearchInput } from "@/components/ui/search-input";
import { FilterBar, SelectFilter } from "@/components/ui/filter-bar";
import { CursorPagination } from "@/components/ui/pagination";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { CatalogListItem } from "@/server/domain/catalog/types";

interface PageProps {
  params: Promise<{ kind: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { kind: kindSegment } = await params;
  const kind = kindFromRouteSegment(kindSegment);
  return { title: kind ? `My ${CATALOG_LABELS[kind].plural}` : "Catalog" };
}

/**
 * The vendor equivalent of the admin catalog list — same reusable
 * components, scoped to `scopeToVendorId: session.vendorProfileId` so a
 * vendor structurally cannot see another vendor's listings (the query
 * builder never receives another vendor's id, matching the Phase 2
 * ownership pattern). See docs/adr/0011.
 */
export default async function VendorCatalogListPage({ params, searchParams }: PageProps) {
  const { kind: kindSegment } = await params;
  const kind = kindFromRouteSegment(kindSegment);
  if (!kind) notFound();

  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has(CATALOG_PERMISSIONS[kind].read)) redirect("/unauthorized");
  if (!session.vendorProfileId) redirect("/unauthorized");

  const rawParams = await searchParams;
  const parsed = catalogListQuerySchema.safeParse(rawParams);
  const query = parsed.success ? parsed.data : catalogListQuerySchema.parse({});

  const repo = getCatalogRepository(kind);
  const [{ items, nextCursor }] = await Promise.all([
    repo.list(query, { scopeToVendorId: session.vendorProfileId }),
  ]);

  const canCreate = session.permissions.has(CATALOG_PERMISSIONS[kind].create);
  const labels = CATALOG_LABELS[kind];
  const hasActiveFilters = Boolean(query.search || query.approvalStatus);

  const columns: DataTableColumn<CatalogListItem>[] = [
    { key: "title", header: "Title", cell: (r) => <span className="font-medium">{r.title}</span> },
    { key: "category", header: "Category", cell: (r) => r.categoryName, hideOnMobile: true },
    { key: "price", header: "Price", cell: (r) => formatPaise(r.price, r.currency) },
    {
      key: "status",
      header: "Status",
      cell: (r) => (
        <div className="flex flex-wrap gap-1">
          <StatusBadge status={r.approvalStatus} />
          {!r.isActive ? <StatusBadge status="INACTIVE" /> : null}
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1>My {labels.plural.toLowerCase()}</h1>
          <p className="text-muted-foreground">Only you can manage these listings.</p>
        </div>
        {canCreate ? (
          <Button
            nativeButton={false}
            render={
              <Link href={`/vendor/catalog/${kindSegment}/new`}>
                <Plus />
                New {labels.singular.toLowerCase()}
              </Link>
            }
          />
        ) : null}
      </div>

      <FilterBar>
        <SearchInput placeholder={`Search my ${labels.plural.toLowerCase()}…`} />
        <SelectFilter
          paramName="approvalStatus"
          ariaLabel="Filter by approval status"
          placeholder="All statuses"
          options={[
            { value: "PENDING", label: "Pending" },
            { value: "APPROVED", label: "Approved" },
            { value: "REJECTED", label: "Rejected" },
          ]}
        />
      </FilterBar>

      {items.length === 0 ? (
        <EmptyState
          icon={Package}
          title={
            hasActiveFilters
              ? `No ${labels.plural.toLowerCase()} match your filters`
              : `No ${labels.plural.toLowerCase()} yet`
          }
          description={
            hasActiveFilters
              ? "Try a different search term or clear the filters."
              : canCreate
                ? `Create your first ${labels.singular.toLowerCase()} to get started.`
                : undefined
          }
        />
      ) : (
        <DataTable
          columns={columns}
          rows={items}
          getRowKey={(r) => r.id}
          getRowHref={(r) => `/vendor/catalog/${kindSegment}/${r.id}` as never}
        />
      )}

      <CursorPagination nextCursor={nextCursor} />
    </div>
  );
}
