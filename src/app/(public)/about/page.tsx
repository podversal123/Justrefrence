import { msg } from "@/i18n/locales";
import { getT } from "@/i18n/server";
import type { Metadata, Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, Gift, Handshake, Store } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("About us"),
    description: t("{name} is headquartered in {city}. {tagline}", {
      name: BRAND.name,
      city: BRAND.headquarters,
      tagline: t(BRAND.tagline),
    }),
  };
}

const PILLARS = [
  {
    icon: BadgeCheck,
    title: msg("Approved vendors only"),
    body: msg(
      "Every vendor is reviewed by our team before they can list anything, so buyers deal with vetted businesses.",
    ),
    tone: "bg-emerald-100 text-emerald-700",
  },
  {
    icon: Store,
    title: msg("Products, services and projects"),
    body: msg(
      "One place to buy goods, hire providers and commission larger pieces of work, each with its own category structure.",
    ),
    tone: "bg-sky-100 text-sky-700",
  },
  {
    icon: Gift,
    title: msg("A referral program that pays"),
    body: msg(
      "Introduce a buyer or a vendor and earn a commission when the orders they place are completed.",
    ),
    tone: "bg-rose-100 text-rose-700",
  },
  {
    icon: Handshake,
    title: msg("Start with zero investment"),
    body: msg(
      "You can begin earning by referring others, with no stock to buy and nothing to set up first.",
    ),
    tone: "bg-amber-100 text-amber-800",
  },
] as const;

export default async function AboutPage() {
  const t = await getT();
  return (
    <div>
      <header className="bg-ink text-ink-foreground relative isolate overflow-hidden">
        <Image
          src="/images/about-team.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="-z-20 object-cover"
        />
        <div
          aria-hidden="true"
          className="from-ink via-ink/85 to-ink/40 absolute inset-0 -z-10 bg-gradient-to-r"
        />
        <div className="mx-auto w-full max-w-5xl px-4 py-20 sm:py-28">
          <p className="text-marigold mb-3 text-sm font-medium">{BRAND.domain}</p>
          <h1 className="font-display max-w-2xl text-4xl leading-[1.08] font-bold tracking-tight text-balance sm:text-6xl">
            {t("About {name}", { name: BRAND.name })}
          </h1>
          <p className="text-ink-foreground/85 mt-5 max-w-xl text-xl text-pretty">
            {t(BRAND.tagline)}
          </p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl px-4 py-14">
        <div className="max-w-2xl space-y-4 text-lg leading-relaxed">
          <p>
            {t(
              "{name} is headquartered in {city}. It is promoted by professionals with more than two decades of experience across technology, markets, business applications and the real challenges entrepreneurs face when they set out on their own.",
              { name: BRAND.name, city: BRAND.headquarters },
            )}
          </p>
          <p>
            {t(
              "The promoters have worked with well-known names in diverse areas of business management. That experience shaped what this platform is for: {purpose} It brings buyers and approved vendors together, and rewards the people who make the introduction.",
              { purpose: t(BRAND.taglineSecondary) },
            )}
          </p>
        </div>

        <ul className="mt-14 grid gap-4 sm:grid-cols-2">
          {PILLARS.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <li key={pillar.title} className="surface-card space-y-3 p-6">
                <span
                  className={`flex size-12 items-center justify-center rounded-2xl ${pillar.tone}`}
                >
                  <Icon className="size-6" aria-hidden="true" />
                </span>
                <h2 className="text-lg font-semibold">{t(pillar.title)}</h2>
                <p className="text-muted-foreground text-sm leading-relaxed">{t(pillar.body)}</p>
              </li>
            );
          })}
        </ul>

        <div className="from-primary mt-14 flex flex-col items-start gap-4 rounded-3xl bg-gradient-to-br to-[oklch(0.42_0.2_20)] p-8 text-white sm:flex-row sm:items-center sm:justify-between sm:p-10">
          <div className="space-y-1">
            <h2 className="font-display text-2xl font-bold sm:text-3xl">
              {t("Ready to get started?")}
            </h2>
            <p className="text-white/85">
              {t("Create an account to buy, sell or start referring.")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={"/register" as Route}
              className={buttonVariants({ size: "touch", variant: "secondary" })}
            >
              {t("Create an account")}
            </Link>
            <Link
              href={"/contact" as Route}
              className={buttonVariants({
                size: "touch",
                variant: "outline",
                className: "border-white/40 bg-transparent text-white hover:bg-white/10",
              })}
            >
              {t("Contact us")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
