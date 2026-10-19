import { getT } from "@/i18n/server";
import type { Metadata } from "next";
import { Mail } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";
import {
  CAREERS_APPLY,
  CAREERS_EMAIL,
  CAREERS_OPENINGS,
  CAREERS_SECTIONS,
} from "@/lib/careers-content";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("Careers"),
    description: CAREERS_SECTIONS[0]!.paragraphs[0],
  };
}

export default async function CareersPage() {
  const t = await getT();
  const subject = encodeURIComponent("Résumé submission");
  return (
    <div>
      <header className="bg-ink text-ink-foreground">
        <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:py-24">
          <p className="text-marigold mb-3 text-sm font-medium">{BRAND.domain}</p>
          <h1 className="font-display max-w-2xl text-4xl leading-[1.08] font-bold tracking-tight text-balance sm:text-6xl">
            {t("Careers")}
          </h1>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl space-y-12 px-4 py-14">
        {CAREERS_SECTIONS.map((section) => (
          <section key={section.id} aria-labelledby={section.id} className="max-w-3xl space-y-4">
            <h2 id={section.id} className="font-display text-2xl font-bold sm:text-3xl">
              {section.heading}
            </h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="text-lg leading-relaxed">
                {paragraph}
              </p>
            ))}
            {section.subheading ? (
              <div className="space-y-4 pt-2">
                <h3 className="text-xl font-semibold">{section.subheading.heading}</h3>
                {section.subheading.paragraphs.map((paragraph) => (
                  <p key={paragraph} className="text-lg leading-relaxed">
                    {paragraph}
                  </p>
                ))}
              </div>
            ) : null}
          </section>
        ))}

        <section aria-labelledby="openings" className="max-w-3xl space-y-4">
          <h2 id="openings" className="font-display text-2xl font-bold sm:text-3xl">
            {CAREERS_OPENINGS.heading}
          </h2>
          {CAREERS_OPENINGS.paragraphs.map((paragraph) => (
            <p key={paragraph} className="text-lg leading-relaxed">
              {paragraph}
            </p>
          ))}
          <h3 className="pt-2 text-xl font-semibold">{CAREERS_OPENINGS.listHeading}</h3>
          <ol className="surface-card list-decimal space-y-2 py-5 pr-5 pl-10 text-lg">
            {CAREERS_OPENINGS.positions.map((position) => (
              <li key={position}>{position}</li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="apply" className="max-w-3xl space-y-4">
          <h2 id="apply" className="font-display text-2xl font-bold sm:text-3xl">
            {CAREERS_APPLY.heading}
          </h2>
          {CAREERS_APPLY.paragraphs.map((paragraph) => (
            <p key={paragraph} className="text-lg leading-relaxed">
              {paragraph}
            </p>
          ))}
          <a
            href={`mailto:${CAREERS_EMAIL}?subject=${subject}`}
            className={buttonVariants({ size: "touch" })}
          >
            <Mail />
            {CAREERS_APPLY.button}
          </a>
          <p className="text-muted-foreground text-sm">
            {t("Send your résumé to {email}.", { email: CAREERS_EMAIL })}
          </p>
        </section>
      </div>
    </div>
  );
}
