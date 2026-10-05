import type { Metadata } from "next";
import { getCatalogRepository } from "@/server/repositories/catalog/registry";
import { PublicCatalogDetail } from "@/components/catalog/public-catalog-detail";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const listing = await getCatalogRepository("PRODUCT").getBySlug(slug);
  return { title: listing?.title ?? "Product" };
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { slug } = await params;
  return <PublicCatalogDetail kind="PRODUCT" slug={slug} />;
}
