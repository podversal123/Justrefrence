// No "server-only" import — orchestration layer; every dependency below
// already carries its own "server-only" guard. Same precedent as every
// other *-service.ts file in this codebase.
import {
  countActiveMembers,
  countPendingListingApprovals,
  countTotalMembers,
  getCatalogCounts,
  getDailyRevenue,
  getDailyWalletActivity,
  getGlobalCommissionSummary,
  getOrderCountsByStatus,
  getPendingPayouts,
  getReferralActivityCount,
  getTotalOrders,
  getTotalRevenue,
  getVendorCounts,
  listPendingApprovals,
  listRecentOrders,
  type OrderListQuery,
} from "@/server/repositories/dashboard/dashboard-repository";
import { enumerateDayBuckets, resolveDateRange, type DateRangePreset } from "@/server/domain/dashboard/date-range";

export async function getAdminDashboardData(preset: DateRangePreset, orderQuery: OrderListQuery) {
  const range = resolveDateRange(preset);
  const dayBuckets = enumerateDayBuckets(range);

  const [
    totalMembers,
    activeMembers,
    vendors,
    catalog,
    pendingListingApprovals,
    orderStatusCounts,
    totalOrders,
    totalRevenue,
    dailyRevenueRows,
    pendingPayouts,
    dailyWalletRows,
    referralActivity,
    commissionSummary,
    recentOrders,
    pendingApprovals,
  ] = await Promise.all([
    countTotalMembers(),
    countActiveMembers(),
    getVendorCounts(),
    getCatalogCounts(),
    countPendingListingApprovals(),
    getOrderCountsByStatus(range),
    getTotalOrders(range),
    getTotalRevenue(range),
    getDailyRevenue(range),
    getPendingPayouts(),
    getDailyWalletActivity(range),
    getReferralActivityCount(range),
    getGlobalCommissionSummary(),
    listRecentOrders(orderQuery),
    listPendingApprovals(),
  ]);

  const revenueByDay = new Map(dailyRevenueRows.map((r) => [r.day, r.amount]));
  const revenueSeries = dayBuckets.map((day) => ({ day, amount: revenueByDay.get(day) ?? 0n }));

  const walletByDay = new Map(dailyWalletRows.map((r) => [r.day, r]));
  const walletSeries = dayBuckets.map((day) => {
    const entry = walletByDay.get(day);
    return { day, credits: entry?.credits ?? 0n, debits: entry?.debits ?? 0n };
  });

  return {
    range,
    totalMembers,
    activeMembers,
    vendors,
    catalog,
    pendingListingApprovals,
    pendingApprovalsTotal: vendors.pending + pendingListingApprovals,
    orderStatusCounts,
    totalOrders,
    totalRevenue,
    revenueSeries,
    pendingPayouts,
    walletSeries,
    referralActivity,
    commissionSummary,
    recentOrders,
    pendingApprovals,
  };
}

export type AdminDashboardData = ReturnType<typeof getAdminDashboardData>;
