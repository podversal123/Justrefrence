import type { Metadata } from "next";
import { PublicCatalogList } from "@/components/catalog/public-catalog-list";

export const metadata: Metadata = {
  title: "Services",
  description: "Browse services from approved vendors on Justreference.",
};

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function ServicesPage({ searchParams }: PageProps) {
  return <PublicCatalogList kind="SERVICE" searchParams={await searchParams} />;
}
