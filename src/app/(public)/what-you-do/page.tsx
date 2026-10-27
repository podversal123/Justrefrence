import { msg } from "@/i18n/locales";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";
import { InfoPage } from "@/components/portal/info-page";

const TITLE = msg("What You Do");
const INTRO = msg("This page is coming soon.");

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t(TITLE) };
}

export default function Page() {
  return <InfoPage title={TITLE} intro={INTRO} />;
}
