import { msg } from "@/i18n/locales";
import { getFormat, getT } from "@/i18n/server";
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
  { id: "vendor-products", label: msg("Products") },
  { id: "vendor-services", label: msg("Services") },
  { id: "vendor-projects", label: msg("Projects") },
  { id: "vendor-orders", label: msg("Orders") },
  { id: "vendor-sales", label: msg("Sales") },
  { id: "vendor-revenue-chart", label: msg("Sales chart") },
  { id: "vendor-order-status-chart", label: msg("Orders-by-status chart") },
];

export async function VendorDashboard({ session }: { session: AuthSession }) {
  const t = await getT();
  const { formatDate } = await getFormat();
  // Defensive only — the page-level router decides who reaches this
  // component at all; a vendor-less session should never get here.
  if (!session.vendorProfileId) {
    return (
      <EmptyState
        icon={Store}
        title={t("No vendor profile")}
        description={t("This dashboard is only available to vendor accounts.")}
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
              <h1>{t("Welcome back, {name}", { name: businessName })}</h1>
              <p className="text-muted-foreground">
                {t("An overview of your storefront.")}{" "}
                {(() => {
                  const slide = HERO_SLIDES.find((s) => s.id === "own-business");
                  return slide ? t(slide.headline) : null;
                })()}
              </p>
            </div>
            <StatusBadge status={approvalStatus} />
          </div>
          <WidgetToggleMenu widgets={WIDGETS} />
        </div>

        {approvalStatus !== "APPROVED" ? (
          <div className="bg-surface-sunken rounded-lg border px-4 py-3 text-sm">
            {approvalStatus === "PENDING"
              ? t(
                  "Your vendor account is pending approval. Once approved, your active listings become visible to customers.",
                )
              : approvalStatus === "REJECTED"
                ? t("Your vendor application was rejected. Visit your vendor profile for details.")
                : t("Your vendor account is suspended. Contact an administrator for details.")}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Widget id="vendor-products">
            <StatCard
              icon={Package}
              label={t("Products")}
              value={catalog.products.total.toLocaleString()}
              sublabel={t("{count} live", { count: catalog.products.active })}
            />
          </Widget>
          <Widget id="vendor-services">
            <StatCard
              icon={Wrench}
              label={t("Services")}
              value={catalog.services.total.toLocaleString()}
              sublabel={t("{count} live", { count: catalog.services.active })}
            />
          </Widget>
          <Widget id="vendor-projects">
            <StatCard
              icon={Briefcase}
              label={t("Projects")}
              value={catalog.projects.total.toLocaleString()}
              sublabel={t("{count} live", { count: catalog.projects.active })}
            />
          </Widget>
          <Widget id="vendor-orders">
            <StatCard
              icon={ShoppingCart}
              label={t("Orders")}
              value={totalOrders.toLocaleString()}
              sublabel={t("Last 30 days")}
            />
          </Widget>
          <Widget id="vendor-sales">
            <StatCard
              icon={LineChartIcon}
              label={t("Sales")}
              value={formatPaise(totalRevenue.toString())}
              sublabel={t("Last 30 days")}
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
              <CardTitle className="text-base">{t("Recent orders")}</CardTitle>
              <CardDescription>
                {recentOrders.items.length === 0
                  ? t("Orders placed with your business will appear here.")
                  : `Your last ${recentOrders.items.length} order${recentOrders.items.length === 1 ? "" : "s"}.`}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href="/vendor/orders" />}
            >
              {t("View all")}
            </Button>
          </CardHeader>
          <CardContent>
            {recentOrders.items.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title={t("No orders yet")}
                description={t(
                  "Once customers order your products or services, they'll show up here.",
                )}
                action={
                  <Button
                    size="touch"
                    nativeButton={false}
                    render={<Link href={"/vendor/catalog/products" as Route} />}
                  >
                    <Package />
                    {t("Manage catalog")}
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
                        {order.buyer.fullName ?? order.buyer.email} ·{" "}
                        {order.items.length === 1
                          ? t("1 item")
                          : t("{count} items", { count: order.items.length })}{" "}
                        · {formatDate(order.createdAt)}
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
            {t("Manage catalog")}
          </Button>
          <Button
            size="touch"
            variant="outline"
            nativeButton={false}
            render={<Link href="/vendor/orders" />}
          >
            <ShoppingCart />
            {t("Vendor orders")}
          </Button>
          <Button
            size="touch"
            variant="outline"
            nativeButton={false}
            render={<Link href="/vendor/profile" />}
          >
            <User />
            {t("Vendor profile")}
          </Button>
        </div>
      </div>
    </WidgetVisibilityProvider>
  );
}
