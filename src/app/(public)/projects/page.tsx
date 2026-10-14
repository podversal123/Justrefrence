import { getT } from "@/i18n/server";
import type { Metadata } from "next";
import { PublicCatalogList } from "@/components/catalog/public-catalog-list";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("Projects"),
    description: t("Browse projects from approved vendors on Justreference."),
  };
}

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function ProjectsPage({ searchParams }: PageProps) {
  return <PublicCatalogList kind="PROJECT" searchParams={await searchParams} />;
}
