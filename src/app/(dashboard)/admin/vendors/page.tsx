import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/server/auth/session";
import { listVendors } from "@/server/repositories/vendor-repository";
import { vendorListQuerySchema } from "@/lib/schemas/vendor";
import { Button } from "@/components/ui/button";
import { VendorFilters } from "./vendor-filters";
import { VendorsTable } from "./vendors-table";
import { CreateVendorDialog } from "./create-vendor-dialog";

export const metadata: Metadata = { title: "Vendors" };

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function VendorsPage({ searchParams }: PageProps) {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("member:read:any")) redirect("/unauthorized");

  const rawParams = await searchParams;
  const parsed = vendorListQuerySchema.safeParse(rawParams);
  const query = parsed.success ? parsed.data : vendorListQuerySchema.parse({});

  const { items, nextCursor } = await listVendors(query);
  const canCreate = session.permissions.has("user:create");
  const hasActiveFilters = Boolean(query.search || query.status);

  const nextParams = new URLSearchParams();
  if (query.search) nextParams.set("search", query.search);
  if (query.status) nextParams.set("status", query.status);
  nextParams.set("sortBy", query.sortBy);
  nextParams.set("sortDir", query.sortDir);
  if (nextCursor) nextParams.set("cursor", nextCursor);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1>Vendors</h1>
          <p className="text-muted-foreground">Manage vendor accounts and approvals.</p>
        </div>
        {canCreate ? <CreateVendorDialog /> : null}
      </div>

      <VendorFilters
        initialSearch={query.search ?? ""}
        initialStatus={query.status ?? ""}
        initialSort={`${query.sortBy}:${query.sortDir}`}
      />

      <VendorsTable vendors={items} hasActiveFilters={hasActiveFilters} />

      {nextCursor ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/admin/vendors?${nextParams.toString()}`}>Load more</Link>}
          />
        </div>
      ) : null}
    </div>
  );
}
