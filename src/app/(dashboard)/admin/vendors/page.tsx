import { getT } from "@/i18n/server";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/server/auth/session";
import { countVendors, listVendors } from "@/server/repositories/vendor-repository";
import { vendorListQuerySchema } from "@/lib/schemas/vendor";
import { Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { VendorFilters } from "./vendor-filters";
import { VendorsTable } from "./vendors-table";
import { CreateVendorDialog } from "./create-vendor-dialog";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Vendors") };
}

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function VendorsPage({ searchParams }: PageProps) {
  const t = await getT();
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("member:read:any")) redirect("/unauthorized");

  const rawParams = await searchParams;
  const parsed = vendorListQuerySchema.safeParse(rawParams);
  const query = parsed.success ? parsed.data : vendorListQuerySchema.parse({});

  const [{ items, nextCursor }, waiting] = await Promise.all([
    listVendors(query),
    // Seller requests from members wait here until someone with the right permission decides.
    countVendors({ status: "PENDING" }),
  ]);
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
          <h1>{t("Vendors")}</h1>
          <p className="text-muted-foreground">{t("Manage vendor accounts and approvals.")}</p>
        </div>
        {canCreate ? <CreateVendorDialog /> : null}
      </div>

      {waiting > 0 && query.status !== "PENDING" ? (
        <Alert>
          <Store className="size-4" />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {waiting === 1
                ? t("1 seller request is waiting for a decision.")
                : t("{count} seller requests are waiting for a decision.", { count: waiting })}
            </span>
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<Link href="/admin/vendors?status=PENDING">{t("Show them")}</Link>}
            />
          </AlertDescription>
        </Alert>
      ) : null}

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
            render={<Link href={`/admin/vendors?${nextParams.toString()}`}>{t("Load more")}</Link>}
          />
        </div>
      ) : null}
    </div>
  );
}
