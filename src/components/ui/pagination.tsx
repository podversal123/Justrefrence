"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * Cursor-based pagination — see docs/api.md §4. A "Load more" link rather
 * than numbered pages, matching cursor pagination's natural UX (no total
 * count needed, no page-N random access into an unbounded list).
 */
export function CursorPagination({ nextCursor }: { nextCursor: string | null }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (!nextCursor) return null;

  const params = new URLSearchParams(searchParams.toString());
  params.set("cursor", nextCursor);
  const href = `${pathname}?${params.toString()}`;

  return (
    <div className="flex justify-center">
      <Button
        variant="outline"
        nativeButton={false}
        render={<Link href={href as never}>Load more</Link>}
      />
    </div>
  );
}
