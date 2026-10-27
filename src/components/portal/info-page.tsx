import { getT } from "@/i18n/server";

/** Plain public page: a heading and a few paragraphs, for the secondary pages under "More". */
export async function InfoPage({ title, intro }: { title: string; intro: string }) {
  const t = await getT();
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-14">
      <h1 className="font-display text-4xl font-bold tracking-tight text-balance sm:text-5xl">
        {t(title)}
      </h1>
      <p className="text-muted-foreground mt-5 max-w-2xl text-lg leading-relaxed">{t(intro)}</p>
    </div>
  );
}
