import Link from "next/link";
import type { Route } from "next";
import {
  Briefcase,
  LineChart as LineChartIcon,
  Package,
  Receipt,
  ShoppingCart,
  Store,
  User,
  Wrench,
} from "lucide-react";
import type { AuthSession } from "@/server/auth/session";
import { getVendorDetail } from "@/server/repositories/vendor-repository";
import { getVendorCatalogCounts } from "@/server/repositories/dashboard/dashboard-repository";
import {
  getDailyRevenueForVendor,
  getOrderStatusCountsForVendor,
  getTotalOrdersForVendor,
  getTotalRevenueForVendor,
  listOrdersForVendor,
} from "@/server/repositories/commerce/order-repository";
import { enumerateDayBuckets, resolveDateRange } from "@/server/domain/dashboard/date-range";
import { formatPaise } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HERO_SLIDES } from "@/lib/brand";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "./stat-card";
import { Widget, WidgetToggleMenu, WidgetVisibilityProvider } from "./widget-visibility";
import { RevenueChart } from "./revenue-chart";
import { OrderStatusChart } from "./order-status-chart";

/**
 * Vendor-id-prefixed so these never collide with the admin dashboard's own
 * widget ids in the shared `jr.dashboard.widgetVisibility.v1` localStorage
 * key (see widget-visibility.tsx) — the two dashboards are mutually
 * exclusive for most accounts, but the storage key isn't namespaced by
 * dashboard type, so distinct ids keep a stray collision impossible.
 */
const WIDGETS = [
  { id: "vendor-products", label: "Products" },
  { id: "vendor-services", label: "Services" },
  { id: "vendor-projects", label: "Projects" },
  { id: "vendor-orders", label: "Orders" },
  { id: "vendor-sales", label: "Sales" },
  { id: "vendor-revenue-chart", label: "Sales chart" },
  { id: "vendor-order-status-chart", label: "Orders-by-status chart" },
];

export async function VendorDashboard({ session }: { session: AuthSession }) {
  // Defensive only — the page-level router decides who reaches this
  // component at all; a vendor-less session should never get here.
  if (!session.vendorProfileId) {
    return (
      <EmptyState
        icon={Store}
        title="No vendor profile"
        description="This dashboard is only available to vendor accounts."
      />
    );
  }

  const vendorId = session.vendorProfileId;
  const range = resolveDateRange("30D");
  const dayBuckets = enumerateDayBuckets(range);

  const [
    vendorDetail,
    catalog,
    orderStatusCounts,
    totalOrders,
    totalRevenue,
    dailyRevenueRows,
    recentOrders,
  ] = await Promise.all([
    getVendorDetail(vendorId),
    getVendorCatalogCounts(vendorId),
    getOrderStatusCountsForVendor(vendorId, range),
    getTotalOrdersForVendor(vendorId, range),
    getTotalRevenueForVendor(vendorId, range),
    getDailyRevenueForVendor(vendorId, range),
    listOrdersForVendor(vendorId, { limit: 5 }),
  ]);

  const revenueByDay = new Map(dailyRevenueRows.map((r) => [r.day, r.amount]));
  const revenueSeries = dayBuckets.map((day) => ({
    day,
    amount: (revenueByDay.get(day) ?? 0n).toString(),
  }));

  const businessName = vendorDetail?.businessName ?? session.fullName ?? "there";
  const approvalStatus = vendorDetail?.approvalStatus ?? "PENDING";

  return (
    <WidgetVisibilityProvider>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div>
              <h1>Welcome back, {businessName}</h1>
              <p className="text-muted-foreground">
                An overview of your storefront.{" "}
                {HERO_SLIDES.find((slide) => slide.id === "own-business")?.headline}
              </p>
            </div>
            <StatusBadge status={approvalStatus} />
          </div>
          <WidgetToggleMenu widgets={WIDGETS} />
        </div>

        {approvalStatus !== "APPROVED" ? (
          <div className="bg-surface-sunken rounded-lg border px-4 py-3 text-sm">
            {approvalStatus === "PENDING"
              ? "Your vendor account is pending approval. Once approved, your active listings become visible to customers."
              : approvalStatus === "REJECTED"
                ? "Your vendor application was rejected. Visit your vendor profile for details."
                : "Your vendor account is suspended. Contact an administrator for details."}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Widget id="vendor-products">
            <StatCard
              icon={Package}
              label="Products"
              value={catalog.products.total.toLocaleString()}
              sublabel={`${catalog.products.active} live`}
            />
          </Widget>
          <Widget id="vendor-services">
            <StatCard
              icon={Wrench}
              label="Services"
              value={catalog.services.total.toLocaleString()}
              sublabel={`${catalog.services.active} live`}
            />
          </Widget>
          <Widget id="vendor-projects">
            <StatCard
              icon={Briefcase}
              label="Projects"
              value={catalog.projects.total.toLocaleString()}
              sublabel={`${catalog.projects.active} live`}
            />
          </Widget>
          <Widget id="vendor-orders">
            <StatCard
              icon={ShoppingCart}
              label="Orders"
              value={totalOrders.toLocaleString()}
              sublabel="Last 30 days"
            />
          </Widget>
          <Widget id="vendor-sales">
            <StatCard
              icon={LineChartIcon}
              label="Sales"
              value={formatPaise(totalRevenue.toString())}
              sublabel="Last 30 days"
              tone="success"
            />
          </Widget>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Widget id="vendor-revenue-chart">
            <RevenueChart data={revenueSeries} />
          </Widget>
          <Widget id="vendor-order-status-chart">
            <OrderStatusChart data={orderStatusCounts} />
          </Widget>
        </div>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Recent orders</CardTitle>
              <CardDescription>
                {recentOrders.items.length === 0
                  ? "Orders placed with your business will appear here."
                  : `Your last ${recentOrders.items.length} order${recentOrders.items.length === 1 ? "" : "s"}.`}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href="/vendor/orders" />}
            >
              View all
            </Button>
          </CardHeader>
          <CardContent>
            {recentOrders.items.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title="No orders yet"
                description="Once customers order your products or services, they'll show up here."
                action={
                  <Button
                    size="touch"
                    nativeButton={false}
                    render={<Link href={"/vendor/catalog/products" as Route} />}
                  >
                    <Package />
                    Manage catalog
                  </Button>
                }
              />
            ) : (
              <div className="flex flex-col gap-3">
                {recentOrders.items.map((order) => (
                  <Link
                    key={order.id}
                    href={`/orders/${order.id}` as Route}
                    className="hover:bg-muted focus-visible:ring-ring/50 flex items-center justify-between rounded-lg border px-4 py-3 transition-colors outline-none focus-visible:ring-3"
                  >
                    <div>
                      <p className="font-medium">{order.orderNumber ?? order.id}</p>
                      <p className="text-muted-foreground text-sm">
                        {order.buyer.fullName ?? order.buyer.email} · {order.items.length} item
                        {order.items.length === 1 ? "" : "s"} ·{" "}
                        {order.createdAt.toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium">
                        {formatPaise(order.grandTotal.toString())}
                      </span>
                      <StatusBadge status={order.status} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Button
            size="touch"
            nativeButton={false}
            render={<Link href={"/vendor/catalog/products" as Route} />}
          >
            <Package />
            Manage catalog
          </Button>
          <Button
            size="touch"
            variant="outline"
            nativeButton={false}
            render={<Link href="/vendor/orders" />}
          >
            <ShoppingCart />
            Vendor orders
          </Button>
          <Button
            size="touch"
            variant="outline"
            nativeButton={false}
            render={<Link href="/vendor/profile" />}
          >
            <User />
            Vendor profile
          </Button>
        </div>
      </div>
    </WidgetVisibilityProvider>
  );
}
