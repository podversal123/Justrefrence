import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { BadgeCheck } from "lucide-react";
import { categoryVisual } from "@/components/portal/category-visual";
import { catalogImagePublicUrlClient } from "@/lib/catalog-image-url";
import { formatPaise } from "@/lib/money";
import type { CatalogListItem } from "@/server/domain/catalog/types";

/**
 * Image-first listing card shared by the homepage and the browse pages.
 * Layout: photo (or a tinted category tile when there is none), category
 * chip, title, approved-vendor line, then the price. The whole card is one
 * link so the target is large and the focus ring is obvious.
 */
export function ListingCard({
  item,
  href,
  priority = false,
}: {
  item: CatalogListItem;
  href: string;
  priority?: boolean;
}) {
  const visual = categoryVisual(item.categoryName);
  const Icon = visual.icon;

  return (
    <Link
      href={href as Route}
      className="surface-card surface-lift group focus-visible:ring-ring/60 flex h-full flex-col overflow-hidden outline-none focus-visible:ring-3"
    >
      <div className="bg-muted relative aspect-[4/3] overflow-hidden">
        {item.primaryImagePath ? (
          <Image
            src={catalogImagePublicUrlClient(item.primaryImagePath)}
            alt={item.title}
            fill
            priority={priority}
            className="object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            sizes="(min-width: 1280px) 22vw, (min-width: 768px) 30vw, 50vw"
          />
        ) : (
          <div className={`${visual.tile} flex h-full items-center justify-center`}>
            <Icon className="size-12" strokeWidth={1.25} aria-hidden="true" />
          </div>
        )}
        <span className="bg-background/90 text-foreground absolute top-3 left-3 rounded-full px-2.5 py-1 text-[11px] font-medium shadow-sm backdrop-blur">
          {item.categoryName}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 text-[15px] leading-snug font-semibold">{item.title}</h3>
        <p className="text-muted-foreground flex items-center gap-1 text-xs">
          <BadgeCheck className="text-success size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{item.vendorBusinessName}</span>
        </p>
        <div className="mt-auto flex items-end justify-between pt-3">
          <p className="text-lg leading-none font-semibold tabular-nums">
            {item.price === null ? (
              <span className="text-muted-foreground text-sm font-medium">Quote on request</span>
            ) : (
              formatPaise(item.price, item.currency)
            )}
          </p>
          <span className="text-primary text-xs font-medium opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:opacity-100">
            View details
          </span>
        </div>
      </div>
    </Link>
  );
}
