import type { Metadata } from "next";
import { getCatalogRepository } from "@/server/repositories/catalog/registry";
import { PublicCatalogDetail } from "@/components/catalog/public-catalog-detail";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const listing = await getCatalogRepository("PROJECT").getBySlug(slug);
  return { title: listing?.title ?? "Project" };
}

export default async function ProjectDetailPage({ params }: PageProps) {
  const { slug } = await params;
  return <PublicCatalogDetail kind="PROJECT" slug={slug} />;
}
