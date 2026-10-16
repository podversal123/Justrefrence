"use client";

import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { Megaphone, Tag } from "lucide-react";
import { useT } from "@/i18n/provider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buttonVariants } from "@/components/ui/button";

export interface NoticeItem {
  id: string;
  title: string;
  body: string;
}

export interface OfferItem {
  id: string;
  headline: string;
  subline: string | null;
  ctaLabel: string;
  ctaHref: string;
  imageUrl: string;
}

function Notice({ item }: { item: NoticeItem }) {
  return (
    <div className="bg-primary/5 border-primary/20 flex gap-3 rounded-xl border p-4">
      <Megaphone className="text-primary mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-semibold">{item.title}</p>
        <p className="text-muted-foreground text-sm whitespace-pre-line">{item.body}</p>
      </div>
    </div>
  );
}

function Offer({ item }: { item: OfferItem }) {
  const external = /^https?:\/\//.test(item.ctaHref);
  return (
    <div className="bg-card flex flex-col overflow-hidden rounded-xl border sm:flex-row">
      <div className="bg-muted relative aspect-[16/7] w-full shrink-0 sm:aspect-auto sm:w-60">
        <Image src={item.imageUrl} alt="" fill sizes="240px" className="object-cover" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col items-start justify-center gap-2 p-4">
        <Tag className="text-primary size-4" aria-hidden="true" />
        <p className="font-semibold">{item.headline}</p>
        {item.subline ? <p className="text-muted-foreground text-sm">{item.subline}</p> : null}
        <Link
          href={item.ctaHref as Route}
          {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className={buttonVariants({ size: "sm" })}
        >
          {item.ctaLabel}
        </Link>
      </div>
    </div>
  );
}

/**
 * What the team has sent, on the dashboard: text notices and image offers, in tabs, with "All" first
 * so nothing is missed. A tab with nothing in it is not shown.
 */
export function CommunicationsTabs({
  notices,
  offers,
}: {
  notices: NoticeItem[];
  offers: OfferItem[];
}) {
  const t = useT();
  const total = notices.length + offers.length;
  if (total === 0) return null;

  const hasBoth = notices.length > 0 && offers.length > 0;

  return (
    <section aria-label={t("From the team")} className="mb-6">
      <Tabs defaultValue="all">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">{t("From the team")}</h2>
          {hasBoth ? (
            <TabsList>
              <TabsTrigger value="all">{t("All ({count})", { count: total })}</TabsTrigger>
              <TabsTrigger value="notices">
                {t("Announcements ({count})", { count: notices.length })}
              </TabsTrigger>
              <TabsTrigger value="offers">
                {t("Offers ({count})", { count: offers.length })}
              </TabsTrigger>
            </TabsList>
          ) : null}
        </div>
        <TabsContent value="all" className="space-y-3">
          {offers.map((offer) => (
            <Offer key={offer.id} item={offer} />
          ))}
          {notices.map((notice) => (
            <Notice key={notice.id} item={notice} />
          ))}
        </TabsContent>
        {hasBoth ? (
          <>
            <TabsContent value="notices" className="space-y-3">
              {notices.map((notice) => (
                <Notice key={notice.id} item={notice} />
              ))}
            </TabsContent>
            <TabsContent value="offers" className="space-y-3">
              {offers.map((offer) => (
                <Offer key={offer.id} item={offer} />
              ))}
            </TabsContent>
          </>
        ) : null}
      </Tabs>
    </section>
  );
}
