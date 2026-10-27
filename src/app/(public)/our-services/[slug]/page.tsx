import { msg } from "@/i18n/locales";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InfoPage } from "@/components/portal/info-page";
import { OUR_SERVICES } from "@/components/portal/our-services";

const INTRO = msg("This page is coming soon.");

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return OUR_SERVICES.map((service) => ({ slug: service.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const t = await getT();
  const { slug } = await params;
  const service = OUR_SERVICES.find((s) => s.slug === slug);
  return { title: service ? t(service.label) : t("Our Services") };
}

export default async function OurServicePage({ params }: Params) {
  const { slug } = await params;
  const service = OUR_SERVICES.find((s) => s.slug === slug);
  if (!service) notFound();
  return <InfoPage title={service.label} intro={INTRO} />;
}
