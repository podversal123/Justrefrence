import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getAuthSession } from "@/server/auth/session";
import { getCatalogRepository } from "@/server/repositories/catalog/registry";
import { listApprovedVendors } from "@/server/repositories/vendor-repository";
import {
  CATALOG_LABELS,
  CATALOG_PERMISSIONS,
  kindFromRouteSegment,
} from "@/server/domain/catalog/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NewListingClient } from "./new-listing-client";

interface PageProps {
  params: Promise<{ kind: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { kind: kindSegment } = await params;
  const kind = kindFromRouteSegment(kindSegment);
  return { title: kind ? `New ${CATALOG_LABELS[kind].singular}` : "Catalog" };
}

export default async function AdminNewListingPage({ params }: PageProps) {
  const { kind: kindSegment } = await params;
  const kind = kindFromRouteSegment(kindSegment);
  if (!kind) notFound();

  const session = await getAuthSession();
  if (!session) redirect("/login");
  // Staff create-on-behalf-of-a-vendor form — vendors use /vendor/catalog/.../new.
  if (
    !session.permissions.has(CATALOG_PERMISSIONS[kind].create) ||
    !session.permissions.has(CATALOG_PERMISSIONS[kind].approve)
  ) {
    redirect("/unauthorized");
  }

  const repo = getCatalogRepository(kind);
  const [categories, vendors] = await Promise.all([repo.listCategories(), listApprovedVendors()]);
  const labels = CATALOG_LABELS[kind];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1>New {labels.singular.toLowerCase()}</h1>
        <p className="text-muted-foreground">Starts as Pending until approved.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>
            You can add images after creating the {labels.singular.toLowerCase()}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewListingClient
            kind={kind}
            kindSegment={kindSegment}
            categories={categories}
            vendors={vendors}
          />
        </CardContent>
      </Card>
    </div>
  );
}
