import type { Metadata } from "next";
import { PublicCatalogList } from "@/components/catalog/public-catalog-list";

export const metadata: Metadata = {
  title: "Products",
  description: "Browse products from approved vendors on Justreference.",
};

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function ProductsPage({ searchParams }: PageProps) {
  return <PublicCatalogList kind="PRODUCT" searchParams={await searchParams} />;
}
