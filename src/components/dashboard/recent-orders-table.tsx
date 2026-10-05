import Link from "next/link";
import { Download, Receipt } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { SearchInput } from "@/components/ui/search-input";
import { FilterBar, SelectFilter } from "@/components/ui/filter-bar";
import { CursorPagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { formatPaise } from "@/lib/money";
import { ORDER_STATUSES } from "@/server/domain/commerce/order-state-machine";

interface OrderRow {
  id: string;
  orderNumber: string | null;
  status: string;
  grandTotal: bigint;
  createdAt: Date;
  buyerEmail: string;
  vendorBusinessName: string;
}

export function RecentOrdersTable({
  items,
  nextCursor,
  search,
  status,
}: {
  items: OrderRow[];
  nextCursor: string | null;
  search?: string;
  status?: string;
}) {
  const exportParams = new URLSearchParams();
  if (search) exportParams.set("search", search);
  if (status) exportParams.set("status", status);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Recent orders</CardTitle>
          <CardDescription>Across every vendor.</CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href={`/api/admin/dashboard/export-orders?${exportParams.toString()}`} />}
        >
          <Download />
          Export CSV
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <FilterBar>
          <SearchInput placeholder="Search order number or buyer email…" />
          <SelectFilter
            paramName="status"
            ariaLabel="Filter by status"
            placeholder="All statuses"
            options={ORDER_STATUSES.map((s) => ({ value: s, label: s }))}
          />
        </FilterBar>

        {items.length === 0 ? (
          <EmptyState icon={Receipt} title="No orders" description="No orders match these filters." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Buyer</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Placed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <Link href={`/orders/${order.id}`} className="hover:underline">
                      {order.orderNumber ?? order.id}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{order.vendorBusinessName}</TableCell>
                  <TableCell className="text-muted-foreground">{order.buyerEmail}</TableCell>
                  <TableCell>{formatPaise(order.grandTotal.toString())}</TableCell>
                  <TableCell>
                    <StatusBadge status={order.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {order.createdAt.toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <CursorPagination nextCursor={nextCursor} />
      </CardContent>
    </Card>
  );
}
