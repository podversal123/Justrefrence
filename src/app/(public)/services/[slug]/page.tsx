import type { Metadata } from "next";
import { getCatalogRepository } from "@/server/repositories/catalog/registry";
import { PublicCatalogDetail } from "@/components/catalog/public-catalog-detail";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const listing = await getCatalogRepository("SERVICE").getBySlug(slug);
  return { title: listing?.title ?? "Service" };
}

export default async function ServiceDetailPage({ params }: PageProps) {
  const { slug } = await params;
  return <PublicCatalogDetail kind="SERVICE" slug={slug} />;
}
