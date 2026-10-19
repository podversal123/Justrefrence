import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@/server/lib/prisma";
import { LEGAL_PAGES, type LegalSlug } from "@/lib/legal-pages";

/**
 * The text of the legal pages, stored as rows in `system_settings` (key `legal.<slug>`). Public reads
 * are cached for 30 seconds and evicted the moment an admin saves.
 */

export const LEGAL_PAGES_TAG = "legal-pages";

const keyFor = (slug: LegalSlug) => `legal.${slug}`;

export type LegalTexts = Record<LegalSlug, string>;

async function readTexts(): Promise<LegalTexts> {
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: LEGAL_PAGES.map((page) => keyFor(page.slug)) } },
    select: { key: true, valueJson: true },
  });
  const byKey = new Map(rows.map((row) => [row.key, row.valueJson]));
  const texts = {} as LegalTexts;
  for (const page of LEGAL_PAGES) {
    const value = byKey.get(keyFor(page.slug));
    texts[page.slug] = typeof value === "string" ? value : "";
  }
  return texts;
}

const readTextsCached = unstable_cache(readTexts, ["legal-pages"], {
  revalidate: 30,
  tags: [LEGAL_PAGES_TAG],
});

/** Never throws: if the text cannot be read, every page simply counts as not published. */
export async function getLegalTexts(): Promise<LegalTexts> {
  try {
    return await readTextsCached();
  } catch {
    return { terms: "", privacy: "", "refund-policy": "" };
  }
}

/** Uncached, for the admin form, so an editor always sees what is really stored. */
export async function getLegalTextsFresh(): Promise<LegalTexts> {
  return readTexts();
}

export async function saveLegalTexts(texts: LegalTexts, actorId: string): Promise<void> {
  await prisma.$transaction(
    LEGAL_PAGES.map((page) =>
      prisma.systemSetting.upsert({
        where: { key: keyFor(page.slug) },
        update: { valueJson: texts[page.slug], valueType: "STRING", updatedBy: actorId },
        create: {
          key: keyFor(page.slug),
          valueJson: texts[page.slug],
          valueType: "STRING",
          updatedBy: actorId,
        },
      }),
    ),
  );
}
