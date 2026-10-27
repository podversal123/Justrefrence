import Link from "next/link";
import type { Route } from "next";
import { cn } from "@/lib/utils";

export interface NewsItem {
  id: string;
  title: string;
  /** A line or two under the headline; left out when the post has none. */
  excerpt: string | null;
  href: string;
  /** Already formatted for the reader's language ("21 Oct 2026"); read out by screen readers. */
  date: string;
  /** The day number and short month for the date badge ("21", "Oct"). */
  day: string;
  month: string;
}

/**
 * The scrolling list inside the News & Events panel, drawn for the panel's dark teal background. It
 * scrolls upward on its own, bottom to top, and starts over without a jump. It stops while the
 * pointer is over it or a link inside has focus, so a headline can be read and clicked, and it does
 * not move at all for visitors who ask for reduced motion (the list then scrolls by hand). The list
 * is written twice, one copy right after the other: the animation slides up by exactly one copy, so
 * the second copy lands where the first began. The second copy is hidden from screen readers and
 * the keyboard so nothing is read or tabbed to twice.
 */
export function NewsTicker({
  items,
  label,
  className,
}: {
  items: NewsItem[];
  label: string;
  className?: string;
}) {
  // Roughly six seconds per headline keeps the pace readable.
  const seconds = Math.max(items.length * 6, 20);

  return (
    <div
      role="region"
      aria-label={label}
      className={cn("news-ticker relative h-80 overflow-hidden", className)}
    >
      <div className="news-ticker-track" style={{ animationDuration: `${seconds}s` }}>
        <NewsList items={items} />
        <NewsList items={items} duplicate />
      </div>
    </div>
  );
}

function NewsList({ items, duplicate = false }: { items: NewsItem[]; duplicate?: boolean }) {
  return (
    <ul
      className="news-ticker-copy divide-y divide-white/10"
      {...(duplicate ? { "aria-hidden": true, inert: true } : {})}
    >
      {items.map((item) => (
        <li key={item.id} className="py-3.5">
          <Link href={item.href as Route} className="group flex gap-3 outline-none">
            <span
              aria-hidden="true"
              className="bg-primary text-primary-foreground flex size-12 shrink-0 flex-col items-center justify-center leading-none"
            >
              <span className="text-lg font-medium tabular-nums">{item.day}</span>
              <span className="mt-0.5 text-[11px]">{item.month}</span>
            </span>
            <span className="min-w-0 flex-1 space-y-1">
              <span className="sr-only">{item.date}</span>
              <span className="block text-sm leading-snug font-medium text-white group-hover:underline group-focus-visible:underline">
                {item.title}
              </span>
              {item.excerpt ? (
                <span className="line-clamp-2 block text-xs leading-relaxed text-white/70">
                  {item.excerpt}
                </span>
              ) : null}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
