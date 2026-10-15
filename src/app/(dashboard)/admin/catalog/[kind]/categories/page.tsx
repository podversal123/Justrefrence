import type { Metadata } from "next";
import { getT } from "@/i18n/server";
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
  const t = await getT();
  return {
    title: kind
      ? t("{kind} categories", { kind: t(CATALOG_LABELS[kind].plural) })
      : t("Categories"),
  };
}

export default async function CategoriesPage({ params }: PageProps) {
  const { kind: kindSegment } = await params;
  const kind = kindFromRouteSegment(kindSegment);
  const t = await getT();
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
        <h1>{t("{kind} categories", { kind: t(labels.plural) })}</h1>
        <p className="text-muted-foreground">
          {t("Shared across admin and vendor {kind} forms.", {
            kind: t(labels.plural).toLowerCase(),
          })}
        </p>
      </div>
      <CategoryManager kind={kind} categories={categories} />
    </div>
  );
}
