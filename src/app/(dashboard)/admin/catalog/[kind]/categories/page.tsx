import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getAuthSession } from "@/server/auth/session";
import { getCatalogRepository } from "@/server/repositories/catalog/registry";
import { CATALOG_LABELS, kindFromRouteSegment } from "@/server/domain/catalog/types";
import { CategoryManager } from "./category-manager";

interface PageProps {
  params: Promise<{ kind: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { kind: kindSegment } = await params;
  const kind = kindFromRouteSegment(kindSegment);
  return { title: kind ? `${CATALOG_LABELS[kind].plural} categories` : "Categories" };
}

export default async function CategoriesPage({ params }: PageProps) {
  const { kind: kindSegment } = await params;
  const kind = kindFromRouteSegment(kindSegment);
  if (!kind) notFound();

  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("category:manage")) redirect("/unauthorized");

  const repo = getCatalogRepository(kind);
  const categories = await repo.listCategories();
  const labels = CATALOG_LABELS[kind];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1>{labels.plural} categories</h1>
        <p className="text-muted-foreground">
          Shared across admin and vendor {labels.plural.toLowerCase()} forms.
        </p>
      </div>
      <CategoryManager kind={kind} categories={categories} />
    </div>
  );
}
