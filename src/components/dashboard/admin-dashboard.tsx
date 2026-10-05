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
import { isDateRangePreset, type DateRangePreset } from "@/server/domain/dashboard/date-range";
import { formatPaise } from "@/lib/money";
import { StatCard } from "./stat-card";
import { DateRangeSelector } from "./date-range-selector";
import { WidgetVisibilityProvider, WidgetToggleMenu, Widget } from "./widget-visibility";
import { RevenueChart } from "./revenue-chart";
import { OrderStatusChart } from "./order-status-chart";
import { WalletActivityChart } from "./wallet-activity-chart";
import { RecentOrdersTable } from "./recent-orders-table";
import { PendingApprovalsTable } from "./pending-approvals-table";

const WIDGETS = [
  { id: "total-members", label: "Total members" },
  { id: "active-members", label: "Active members" },
  { id: "vendors", label: "Vendors" },
  { id: "products", label: "Products" },
  { id: "services", label: "Services" },
  { id: "projects", label: "Projects" },
  { id: "orders", label: "Orders" },
  { id: "revenue", label: "Revenue" },
  { id: "pending-payouts", label: "Pending payouts" },
  { id: "referral-activity", label: "Referral activity" },
  { id: "commissions", label: "Commissions" },
  { id: "support-tickets", label: "Support tickets" },
  { id: "pending-approvals-stat", label: "Pending approvals" },
  { id: "revenue-chart", label: "Revenue chart" },
  { id: "order-status-chart", label: "Orders-by-status chart" },
  { id: "wallet-activity-chart", label: "Wallet activity chart" },
];

export async function AdminDashboard({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const range: DateRangePreset = isDateRangePreset(searchParams["range"]) ? searchParams["range"] : "30D";
  const search = searchParams["search"];
  const status = searchParams["status"];
  const cursor = searchParams["cursor"];

  const data = await getAdminDashboardData(range, { search, status, cursor, limit: 10 });

  const availableCommission = data.commissionSummary.find((c) => c.status === "AVAILABLE")?.totalAmount ?? 0n;
  const pendingCommission = data.commissionSummary.find((c) => c.status === "PENDING")?.totalAmount ?? 0n;

  const revenueSeries = data.revenueSeries.map((d) => ({ day: d.day, amount: d.amount.toString() }));
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
            <h1>Dashboard</h1>
            <p className="text-muted-foreground">An overview of the platform.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DateRangeSelector current={data.range.preset} />
            <WidgetToggleMenu widgets={WIDGETS} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Widget id="total-members">
            <StatCard icon={Users} label="Total members" value={data.totalMembers.toLocaleString()} />
          </Widget>
          <Widget id="active-members">
            <StatCard icon={UserCheck} label="Active members" value={data.activeMembers.toLocaleString()} />
          </Widget>
          <Widget id="vendors">
            <StatCard
              icon={Store}
              label="Vendors"
              value={data.vendors.total.toLocaleString()}
              sublabel={`${data.vendors.pending} pending`}
              tone={data.vendors.pending > 0 ? "warning" : "default"}
            />
          </Widget>
          <Widget id="products">
            <StatCard
              icon={Package}
              label="Products"
              value={data.catalog.products.total.toLocaleString()}
              sublabel={`${data.catalog.products.active} live`}
            />
          </Widget>
          <Widget id="services">
            <StatCard
              icon={Wrench}
              label="Services"
              value={data.catalog.services.total.toLocaleString()}
              sublabel={`${data.catalog.services.active} live`}
            />
          </Widget>
          <Widget id="projects">
            <StatCard
              icon={Briefcase}
              label="Projects"
              value={data.catalog.projects.total.toLocaleString()}
              sublabel={`${data.catalog.projects.active} live`}
            />
          </Widget>
          <Widget id="orders">
            <StatCard icon={ShoppingCart} label="Orders" value={data.totalOrders.toLocaleString()} sublabel="This period" />
          </Widget>
          <Widget id="revenue">
            <StatCard icon={LineChartIcon} label="Revenue" value={formatPaise(data.totalRevenue.toString())} sublabel="This period" />
          </Widget>
          <Widget id="pending-payouts">
            <StatCard
              icon={PiggyBank}
              label="Pending payouts"
              value={formatPaise(data.pendingPayouts.amount.toString())}
              sublabel={`${data.pendingPayouts.count} request${data.pendingPayouts.count === 1 ? "" : "s"}`}
              tone={data.pendingPayouts.count > 0 ? "warning" : "default"}
            />
          </Widget>
          <Widget id="referral-activity">
            <StatCard icon={Receipt} label="Referral activity" value={data.referralActivity.toLocaleString()} sublabel="New referrals this period" />
          </Widget>
          <Widget id="commissions">
            <StatCard
              icon={Percent}
              label="Commissions available"
              value={formatPaise(availableCommission.toString())}
              sublabel={`${formatPaise(pendingCommission.toString())} pending`}
            />
          </Widget>
          <Widget id="support-tickets">
            <StatCard icon={Headset} label="Support tickets" value="—" sublabel="Not yet built" tone="muted" />
          </Widget>
          <Widget id="pending-approvals-stat">
            <StatCard
              icon={ClipboardCheck}
              label="Pending approvals"
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

        <Widget id="wallet-activity-chart">
          <WalletActivityChart data={walletSeries} />
        </Widget>

        <RecentOrdersTable items={data.recentOrders.items} nextCursor={data.recentOrders.nextCursor} search={search} status={status} />
        <PendingApprovalsTable items={data.pendingApprovals} />
      </div>
    </WidgetVisibilityProvider>
  );
}
