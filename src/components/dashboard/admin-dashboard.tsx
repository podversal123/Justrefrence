import { msg } from "@/i18n/locales";
import { getT } from "@/i18n/server";
import {
  Briefcase,
  Headset,
  LineChart as LineChartIcon,
  Package,
  Percent,
  PiggyBank,
  Receipt,
  ShoppingCart,
  Store,
  Users,
  UserCheck,
  Wrench,
  ClipboardCheck,
} from "lucide-react";
import { getAdminDashboardData } from "@/server/domain/dashboard/dashboard-service";
import { countTicketsByStatus } from "@/server/repositories/support/ticket-repository";
import { isDateRangePreset, type DateRangePreset } from "@/server/domain/dashboard/date-range";
import { formatPaise } from "@/lib/money";
import { StatCard } from "./stat-card";
import { DateRangeSelector } from "./date-range-selector";
import { WidgetVisibilityProvider, WidgetToggleMenu, Widget } from "./widget-visibility";
import { RevenueChart } from "./revenue-chart";
import { OrderStatusChart } from "./order-status-chart";
import { WalletActivityChart } from "./wallet-activity-chart";
import {
  CatalogMixChart,
  CategoryListingsChart,
  MembersJoinedChart,
  VendorStatusChart,
} from "./admin-charts";
import { RecentOrdersTable } from "./recent-orders-table";
import { PendingApprovalsTable } from "./pending-approvals-table";

const WIDGETS = [
  { id: "total-members", label: msg("Total members") },
  { id: "active-members", label: msg("Active members") },
  { id: "vendors", label: msg("Vendors") },
  { id: "products", label: msg("Products") },
  { id: "services", label: msg("Services") },
  { id: "projects", label: msg("Projects") },
  { id: "orders", label: msg("Orders") },
  { id: "revenue", label: msg("Revenue") },
  { id: "pending-payouts", label: msg("Pending payouts") },
  { id: "referral-activity", label: msg("Referral activity") },
  { id: "commissions", label: msg("Commissions") },
  { id: "support-tickets", label: msg("Support tickets") },
  { id: "pending-approvals-stat", label: msg("Pending approvals") },
  { id: "revenue-chart", label: msg("Revenue chart") },
  { id: "order-status-chart", label: msg("Orders-by-status chart") },
  { id: "wallet-activity-chart", label: msg("Wallet activity chart") },
  { id: "members-chart", label: msg("Members joined chart") },
  { id: "catalog-mix-chart", label: msg("Catalogue mix chart") },
  { id: "vendor-status-chart", label: msg("Vendors-by-status chart") },
  { id: "category-chart", label: msg("Top categories chart") },
];

export async function AdminDashboard({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const t = await getT();
  const range: DateRangePreset = isDateRangePreset(searchParams["range"])
    ? searchParams["range"]
    : "30D";
  const search = searchParams["search"];
  const status = searchParams["status"];
  const cursor = searchParams["cursor"];

  const data = await getAdminDashboardData(range, { search, status, cursor, limit: 10 });
  // Support ticket counts are a nice-to-have on this page: never let them break the dashboard.
  const ticketCounts = await countTicketsByStatus().catch(() => null);
  const openTickets = ticketCounts
    ? (ticketCounts.OPEN ?? 0) + (ticketCounts.IN_PROGRESS ?? 0)
    : null;

  const availableCommission =
    data.commissionSummary.find((c) => c.status === "AVAILABLE")?.totalAmount ?? 0n;
  const pendingCommission =
    data.commissionSummary.find((c) => c.status === "PENDING")?.totalAmount ?? 0n;

  const revenueSeries = data.revenueSeries.map((d) => ({
    day: d.day,
    amount: d.amount.toString(),
  }));
  const walletSeries = data.walletSeries.map((d) => ({
    day: d.day,
    credits: d.credits.toString(),
    debits: d.debits.toString(),
  }));

  return (
    <WidgetVisibilityProvider>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1>{t("Dashboard")}</h1>
            <p className="text-muted-foreground">{t("An overview of the platform.")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DateRangeSelector current={data.range.preset} />
            <WidgetToggleMenu widgets={WIDGETS} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Widget id="total-members">
            <StatCard
              icon={Users}
              label={t("Total members")}
              value={data.totalMembers.toLocaleString()}
            />
          </Widget>
          <Widget id="active-members">
            <StatCard
              icon={UserCheck}
              label={t("Active members")}
              value={data.activeMembers.toLocaleString()}
            />
          </Widget>
          <Widget id="vendors">
            <StatCard
              icon={Store}
              label={t("Vendors")}
              value={data.vendors.total.toLocaleString()}
              sublabel={t("{count} pending", { count: data.vendors.pending })}
              tone={data.vendors.pending > 0 ? "warning" : "default"}
            />
          </Widget>
          <Widget id="products">
            <StatCard
              icon={Package}
              label={t("Products")}
              value={data.catalog.products.total.toLocaleString()}
              sublabel={t("{count} live", { count: data.catalog.products.active })}
            />
          </Widget>
          <Widget id="services">
            <StatCard
              icon={Wrench}
              label={t("Services")}
              value={data.catalog.services.total.toLocaleString()}
              sublabel={t("{count} live", { count: data.catalog.services.active })}
            />
          </Widget>
          <Widget id="projects">
            <StatCard
              icon={Briefcase}
              label={t("Projects")}
              value={data.catalog.projects.total.toLocaleString()}
              sublabel={t("{count} live", { count: data.catalog.projects.active })}
            />
          </Widget>
          <Widget id="orders">
            <StatCard
              icon={ShoppingCart}
              label={t("Orders")}
              value={data.totalOrders.toLocaleString()}
              sublabel={t("This period")}
            />
          </Widget>
          <Widget id="revenue">
            <StatCard
              icon={LineChartIcon}
              label={t("Revenue")}
              value={formatPaise(data.totalRevenue.toString())}
              sublabel={t("This period")}
            />
          </Widget>
          <Widget id="pending-payouts">
            <StatCard
              icon={PiggyBank}
              label={t("Pending payouts")}
              value={formatPaise(data.pendingPayouts.amount.toString())}
              sublabel={
                data.pendingPayouts.count === 1
                  ? t("1 request")
                  : t("{count} requests", { count: data.pendingPayouts.count })
              }
              tone={data.pendingPayouts.count > 0 ? "warning" : "default"}
            />
          </Widget>
          <Widget id="referral-activity">
            <StatCard
              icon={Receipt}
              label={t("Referral activity")}
              value={data.referralActivity.toLocaleString()}
              sublabel={t("New referrals this period")}
            />
          </Widget>
          <Widget id="commissions">
            <StatCard
              icon={Percent}
              label={t("Commissions available")}
              value={formatPaise(availableCommission.toString())}
              sublabel={t("{amount} pending", {
                amount: formatPaise(pendingCommission.toString()),
              })}
            />
          </Widget>
          <Widget id="support-tickets">
            <StatCard
              icon={Headset}
              label={t("Support tickets")}
              value={openTickets === null ? "—" : openTickets.toLocaleString()}
              sublabel={
                openTickets === null ? t("Unavailable right now") : t("Open or in progress")
              }
              tone={openTickets ? "warning" : "default"}
            />
          </Widget>
          <Widget id="pending-approvals-stat">
            <StatCard
              icon={ClipboardCheck}
              label={t("Pending approvals")}
              value={data.pendingApprovalsTotal.toLocaleString()}
              tone={data.pendingApprovalsTotal > 0 ? "warning" : "default"}
            />
          </Widget>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Widget id="revenue-chart">
            <RevenueChart data={revenueSeries} />
          </Widget>
          <Widget id="order-status-chart">
            <OrderStatusChart data={data.orderStatusCounts} />
          </Widget>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Widget id="members-chart">
            <div className="lg:col-span-2">
              <MembersJoinedChart data={data.membersSeries} />
            </div>
          </Widget>
          <Widget id="catalog-mix-chart">
            <CatalogMixChart
              products={data.catalog.products.active}
              services={data.catalog.services.active}
              projects={data.catalog.projects.active}
            />
          </Widget>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Widget id="category-chart">
            <CategoryListingsChart data={data.listingsByCategory} />
          </Widget>
          <Widget id="vendor-status-chart">
            <VendorStatusChart data={data.vendorStatusCounts} />
          </Widget>
        </div>

        <Widget id="wallet-activity-chart">
          <WalletActivityChart data={walletSeries} />
        </Widget>

        <RecentOrdersTable
          items={data.recentOrders.items}
          nextCursor={data.recentOrders.nextCursor}
          search={search}
          status={status}
        />
        <PendingApprovalsTable items={data.pendingApprovals} />
      </div>
    </WidgetVisibilityProvider>
  );
}
