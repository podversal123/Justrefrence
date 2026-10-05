import { NextResponse } from "next/server";
import { authorize } from "@/server/auth/authorize";
import { listAllMatchingOrders } from "@/server/repositories/dashboard/dashboard-repository";
import { toCsv } from "@/server/domain/dashboard/csv-export";
import { formatPaise } from "@/lib/money";

/** CSV export for the dashboard's recent-orders table — respects the same search/status filters as the on-screen table. */
export async function GET(request: Request) {
  try {
    await authorize("order:read:any");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const search = url.searchParams.get("search") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;

  const orders = await listAllMatchingOrders({ search, status });

  const csv = toCsv(
    ["Order number", "Status", "Amount", "Vendor", "Buyer email", "Created at"],
    orders.map((o) => [
      o.orderNumber ?? "",
      o.status,
      formatPaise(o.grandTotal.toString(), o.currency),
      o.vendor.businessName,
      o.buyer.email,
      o.createdAt.toISOString(),
    ]),
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
