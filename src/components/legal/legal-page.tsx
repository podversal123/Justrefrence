import { getT } from "@/i18n/server";
import { notFound } from "next/navigation";
import { LEGAL_PAGES, splitParagraphs, type LegalSlug } from "@/lib/legal-pages";
import { getLegalTexts } from "@/server/lib/legal-store";

/** A public legal page. A page with no text yet does not exist: it answers 404 rather than showing an empty shell. */
export async function LegalPage({ slug }: { slug: LegalSlug }) {
  const t = await getT();
  const text = (await getLegalTexts())[slug];
  const paragraphs = splitParagraphs(text);
  if (paragraphs.length === 0) notFound();
  const page = LEGAL_PAGES.find((candidate) => candidate.slug === slug)!;

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-14">
      <h1 className="font-display mb-8 text-3xl font-bold sm:text-4xl">{t(page.title)}</h1>
      <div className="space-y-4 text-base leading-relaxed">
        {paragraphs.map((paragraph, index) => (
          <p key={index} className="break-words whitespace-pre-line">
            {paragraph}
          </p>
        ))}
      </div>
    </article>
  );
}

export async function legalMetadata(slug: LegalSlug) {
  const t = await getT();
  const page = LEGAL_PAGES.find((candidate) => candidate.slug === slug)!;
  return { title: t(page.title) };
}
