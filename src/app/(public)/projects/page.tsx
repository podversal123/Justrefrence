import type { Metadata } from "next";
import { PublicCatalogList } from "@/components/catalog/public-catalog-list";

export const metadata: Metadata = {
  title: "Projects",
  description: "Browse projects from approved vendors on Justreference.",
};

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function ProjectsPage({ searchParams }: PageProps) {
  return <PublicCatalogList kind="PROJECT" searchParams={await searchParams} />;
}
