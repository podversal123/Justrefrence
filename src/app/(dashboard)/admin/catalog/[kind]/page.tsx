import { msg } from "@/i18n/locales";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";
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
import Link from "next/link";
import type { CatalogListItem } from "@/server/domain/catalog/types";

interface PageProps {
  params: Promise<{ kind: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { kind: kindSegment } = await params;
  const kind = kindFromRouteSegment(kindSegment);
  return { title: kind ? CATALOG_LABELS[kind].plural : "Catalog" };
}

/**
 * ONE list page serving all three catalog kinds — see
 * docs/adr/0011-catalog-architecture.md. Admin sees every vendor's
 * listings, every status; the equivalent vendor page (same components,
 * different data scope) lives at (dashboard)/vendor/catalog/[kind].
 */
export default async function AdminCatalogListPage({ params, searchParams }: PageProps) {
  const t = await getT();
  const { kind: kindSegment } = await params;
  const kind = kindFromRouteSegment(kindSegment);
  if (!kind) notFound();

  const session = await getAuthSession();
  if (!session) redirect("/login");
  // Staff-only area: `<kind>:read` is ALSO held by vendors and customers (for
  // the public catalog / their own listings), so it can't gate the all-vendors
  // admin view. Only reviewers (who hold `<kind>:approve`) get in.
  if (
    !session.permissions.has(CATALOG_PERMISSIONS[kind].read) ||
    !session.permissions.has(CATALOG_PERMISSIONS[kind].approve)
  ) {
    redirect("/unauthorized");
  }

  const rawParams = await searchParams;
  const parsed = catalogListQuerySchema.safeParse(rawParams);
  const query = parsed.success ? parsed.data : catalogListQuerySchema.parse({});

  const repo = getCatalogRepository(kind);
  const [{ items, nextCursor }, categories] = await Promise.all([
    repo.list(query),
    repo.listCategories(),
  ]);

  const canCreate = session.permissions.has(CATALOG_PERMISSIONS[kind].create);
  const labels = CATALOG_LABELS[kind];
  const hasActiveFilters = Boolean(query.search || query.categoryId || query.approvalStatus);

  const columns: DataTableColumn<CatalogListItem>[] = [
    {
      key: "listingId",
      header: msg("ID"),
      cell: (r) => <span className="font-mono text-xs">{r.listingId}</span>,
    },
    {
      key: "title",
      header: msg("Title"),
      cell: (r) => <span className="font-medium">{r.title}</span>,
    },
    { key: "vendor", header: msg("Vendor"), cell: (r) => r.vendorBusinessName },
    { key: "category", header: msg("Category"), cell: (r) => r.categoryName, hideOnMobile: true },
    { key: "price", header: msg("Price"), cell: (r) => formatPaise(r.price, r.currency) },
    {
      key: "status",
      header: msg("Status"),
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
          <h1>{t(labels.plural)}</h1>
          <p className="text-muted-foreground">
            {t("Manage every vendor's {kind}.", { kind: t(labels.plural).toLowerCase() })}
          </p>
        </div>
        <div className="flex gap-2">
          {session.permissions.has("category:manage") ? (
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <Link href={`/admin/catalog/${kindSegment}/categories`}>{t("Categories")}</Link>
              }
            />
          ) : null}
          {canCreate ? (
            <Button
              nativeButton={false}
              render={
                <Link href={`/admin/catalog/${kindSegment}/new`}>
                  <Plus />
                  {t("New {kind}", { kind: t(labels.singular).toLowerCase() })}
                </Link>
              }
            />
          ) : null}
        </div>
      </div>

      <FilterBar>
        <SearchInput placeholder={t("Search {kind}…", { kind: t(labels.plural).toLowerCase() })} />
        <SelectFilter
          paramName="approvalStatus"
          ariaLabel={msg("Filter by approval status")}
          placeholder={t("All statuses")}
          options={[
            { value: "PENDING", label: "Pending" },
            { value: "APPROVED", label: "Approved" },
            { value: "REJECTED", label: "Rejected" },
          ]}
        />
        <SelectFilter
          paramName="categoryId"
          ariaLabel={msg("Filter by category")}
          placeholder={t("All categories")}
          options={categories.map((c: { id: string; name: string }) => ({
            value: c.id,
            label: c.name,
          }))}
        />
      </FilterBar>

      {items.length === 0 ? (
        <EmptyState
          icon={Package}
          title={
            hasActiveFilters
              ? t("No {kind} match your filters", { kind: t(labels.plural).toLowerCase() })
              : t("No {kind} yet", { kind: t(labels.plural).toLowerCase() })
          }
          description={
            hasActiveFilters
              ? t("Try a different search term or clear the filters.")
              : canCreate
                ? t("Create the first {kind} to get started.", {
                    kind: t(labels.singular).toLowerCase(),
                  })
                : undefined
          }
        />
      ) : (
        <DataTable
          columns={columns}
          rows={items}
          getRowKey={(r) => r.id}
          getRowHref={(r) => `/admin/catalog/${kindSegment}/${r.id}` as never}
        />
      )}

      <CursorPagination nextCursor={nextCursor} />
    </div>
  );
}
