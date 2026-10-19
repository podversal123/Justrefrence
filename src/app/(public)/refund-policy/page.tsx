import type { Metadata } from "next";
import { LegalPage, legalMetadata } from "@/components/legal/legal-page";

// Wording comes from Admin > Legal pages; this page answers 404 until an admin publishes it.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return legalMetadata("refund-policy");
}

export default function Page() {
  return <LegalPage slug="refund-policy" />;
}
