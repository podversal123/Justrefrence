import Link from "next/link";
import type { Route } from "next";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Rendered in the mobile card layout too, unless hideOnMobile is set. */
  hideOnMobile?: boolean;
  className?: string;
}

/**
 * Generic responsive table — desktop `<table>`, mobile stacked cards (see
 * docs/architecture.md's UI principles: "tables become cards on mobile").
 * Used by every list view in the app (Phase 2's admin/vendor lists and
 * every Phase 3 catalog list) — see the brief's "DataTable" reusable-
 * component requirement.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  getRowHref,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  /** If provided, each row (desktop) / card (mobile) links here. */
  getRowHref?: (row: T) => Route;
}) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.key} className={col.className}>
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const href = getRowHref?.(row);
              return (
                <TableRow key={getRowKey(row)}>
                  {columns.map((col, i) => (
                    <TableCell key={col.key} className={col.className}>
                      {href && i === 0 ? (
                        <Link href={href} className="hover:underline">
                          {col.cell(row)}
                        </Link>
                      ) : (
                        col.cell(row)
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-3 md:hidden">
        {rows.map((row) => {
          const href = getRowHref?.(row);
          const cardColumns = columns.filter((c) => !c.hideOnMobile);
          const content = (
            <div className="space-y-1.5">
              {cardColumns.map((col) => (
                <div key={col.key} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-muted-foreground shrink-0">{col.header}</span>
                  <span className="text-right">{col.cell(row)}</span>
                </div>
              ))}
            </div>
          );
          return href ? (
            <Link
              key={getRowKey(row)}
              href={href}
              className="hover:bg-muted/40 block rounded-lg border p-4"
            >
              {content}
            </Link>
          ) : (
            <div key={getRowKey(row)} className="rounded-lg border p-4">
              {content}
            </div>
          );
        })}
      </div>
    </>
  );
}
