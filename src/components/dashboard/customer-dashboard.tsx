import Link from "next/link";
import { BRAND } from "@/lib/brand";
import type { Route } from "next";
import type { LucideIcon } from "lucide-react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Gift,
  LifeBuoy,
  Package,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
  UserCircle,
  Users,
  Wallet as WalletIcon,
} from "lucide-react";
import type { AuthSession } from "@/server/auth/session";
import {
  getOrCreateWallet,
  listWalletTransactions,
} from "@/server/repositories/wallet/wallet-repository";
import { getReferralDashboard } from "@/server/domain/referral/referral-service";
import { listOrdersForBuyer } from "@/server/repositories/commerce/order-repository";
import {
  countUnreadNotifications,
  listRecentNotifications,
} from "@/server/repositories/identity/notification-repository";
import { NotFoundError } from "@/server/lib/errors";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import { StatCard } from "./stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Button } from "@/components/ui/button";
import { CopyLinkButton } from "@/app/(dashboard)/referrals/copy-link-button";
import { DashboardNotificationList } from "./dashboard-notification-list";

const QUICK_ACTIONS: { href: Route; label: string; icon: LucideIcon }[] = [
  { href: "/products" as Route, label: "Browse products", icon: ShoppingBag },
  { href: "/referrals" as Route, label: "My referrals", icon: Users },
  { href: "/orders" as Route, label: "My orders", icon: Package },
  { href: "/profile" as Route, label: "My profile", icon: UserCircle },
  { href: "/cart" as Route, label: "Cart", icon: ShoppingCart },
];

/** "TOPUP" -> "Topup", "ADJUSTMENT" -> "Adjustment" — same lowercase-after-first-letter convention used elsewhere for enum display. */
function formatTransactionType(type: string): string {
  const words = type.split("_");
  return words.map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");
}

/**
 * Customer-facing dashboard: greeting, wallet, earnings, referrals, orders,
 * quick actions, notifications, recent transactions, support — per the
 * client brief. Every data fetch beyond the session itself is wrapped in
 * its own try/catch so a genuine failure in one section (or the very
 * common "brand-new member, nothing exists yet" path) degrades to an
 * inline empty/error state instead of crashing the whole page.
 */
export async function CustomerDashboard({ session }: { session: AuthSession }) {
  const today = new Date();
  const dateLabel = today.toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  let wallet: Awaited<ReturnType<typeof getOrCreateWallet>> | null = null;
  let walletError = false;
  try {
    wallet = await getOrCreateWallet(session.userId);
  } catch {
    walletError = true;
  }

  let transactions: Awaited<ReturnType<typeof listWalletTransactions>>["items"] = [];
  let transactionsError = walletError;
  if (wallet) {
    try {
      const result = await listWalletTransactions(wallet.id, { limit: 5 });
      transactions = result.items;
    } catch {
      transactionsError = true;
    }
  }

  let referral: Awaited<ReturnType<typeof getReferralDashboard>> | null = null;
  let referralStatus: "ok" | "not_found" | "error" = "ok";
  try {
    const appBaseUrl = process.env["APP_BASE_URL"] ?? "http://localhost:3000";
    referral = await getReferralDashboard(session.userId, appBaseUrl);
  } catch (err) {
    referralStatus = err instanceof NotFoundError ? "not_found" : "error";
  }

  const commissionSummary = referral?.commissionSummary ?? [];
  const availableEarnings =
    commissionSummary.find((c) => c.status === "AVAILABLE")?.totalAmount ?? 0n;
  const pendingEarnings = commissionSummary
    .filter((c) => c.status === "PENDING" || c.status === "ELIGIBLE")
    .reduce((sum, c) => sum + c.totalAmount, 0n);

  let orders: Awaited<ReturnType<typeof listOrdersForBuyer>>["items"] = [];
  let ordersError = false;
  try {
    const result = await listOrdersForBuyer(session.userId, { limit: 5 });
    orders = result.items;
  } catch {
    ordersError = true;
  }

  let notifications: Awaited<ReturnType<typeof listRecentNotifications>> = [];
  let unreadCount = 0;
  let notificationsError = false;
  try {
    const [recent, unread] = await Promise.all([
      listRecentNotifications(session.userId),
      countUnreadNotifications(session.userId),
    ]);
    notifications = recent.slice(0, 5);
    unreadCount = unread;
  } catch {
    notificationsError = true;
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1>Welcome back, {session.fullName ?? session.email}</h1>
        <p className="text-muted-foreground">
          {dateLabel} · {BRAND.taglineSecondary}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={WalletIcon}
          label="Wallet balance"
          value={wallet ? formatPaise(wallet.balance.toString()) : "—"}
          sublabel={
            wallet
              ? `${formatPaise(wallet.pendingBalance.toString())} pending`
              : "Couldn't load your wallet"
          }
          tone={walletError ? "muted" : "default"}
        />
        <StatCard
          icon={TrendingUp}
          label="Earnings available"
          value={formatPaise(availableEarnings.toString())}
          sublabel={`${formatPaise(pendingEarnings.toString())} pending`}
          tone={availableEarnings > 0n ? "success" : "default"}
        />
        <StatCard
          icon={Users}
          label="Referrals"
          value={referral ? referral.directReferralCount.toLocaleString() : "0"}
          sublabel={referral ? `${referral.indirectReferralCount} indirect` : "No referrals yet"}
        />
      </div>

      <section className="bg-surface-sunken rounded-xl border p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Your referral link</h2>
            <p className="text-muted-foreground text-sm">
              Share it — anyone who signs up through it becomes your direct referral.
            </p>
          </div>
          <Gift className="text-muted-foreground hidden size-5 sm:block" aria-hidden="true" />
        </div>
        <div className="mt-4">
          {referral ? (
            <CopyLinkButton link={referral.referralLink} />
          ) : referralStatus === "not_found" ? (
            <EmptyState
              icon={Gift}
              title="Your referral link isn't ready yet"
              description="Your referral profile is still being set up. Check back shortly."
            />
          ) : (
            <ErrorState title="Couldn't load your referral link" />
          )}
        </div>
      </section>

      <div>
        <h2 className="sr-only">Quick actions</h2>
        <div className="flex flex-wrap gap-2">
          {QUICK_ACTIONS.map(({ href, label, icon: Icon }) => (
            <Button
              key={href}
              variant="outline"
              size="touch"
              nativeButton={false}
              render={
                <Link href={href}>
                  <Icon />
                  {label}
                </Link>
              }
            />
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Recent orders</h2>
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link href="/orders">View all</Link>}
            />
          </div>
          {ordersError ? (
            <ErrorState title="Couldn't load your orders" />
          ) : orders.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No orders yet"
              description="When you place an order, it will show up here."
              action={
                <Button
                  size="touch"
                  nativeButton={false}
                  render={<Link href="/products">Browse products</Link>}
                />
              }
            />
          ) : (
            <div className="bg-surface-sunken divide-border divide-y rounded-xl border">
              {orders.map((order) => (
                <Link
                  key={order.id}
                  href={`/orders/${order.id}` as Route}
                  className="focus-visible:ring-ring/50 hover:bg-muted/50 flex items-center justify-between gap-3 px-4 py-3 outline-none first:rounded-t-xl last:rounded-b-xl focus-visible:ring-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{order.orderNumber ?? order.id}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      {order.vendor.businessName} · {order.createdAt.toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm font-medium">
                      {formatPaise(order.grandTotal.toString())}
                    </span>
                    <StatusBadge status={order.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">Notifications</h2>
          {notificationsError ? (
            <ErrorState title="Couldn't load your notifications" />
          ) : (
            <div className="bg-surface-sunken rounded-xl border px-4 py-3">
              <DashboardNotificationList notifications={notifications} unreadCount={unreadCount} />
            </div>
          )}
        </section>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Recent transactions</h2>
        {transactionsError ? (
          <ErrorState title="Couldn't load your transactions" />
        ) : transactions.length === 0 ? (
          <EmptyState
            icon={WalletIcon}
            title="No transactions yet"
            description="Credits and debits to your wallet will show up here."
          />
        ) : (
          <div className="bg-surface-sunken divide-border divide-y rounded-xl border">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full",
                      tx.direction === "CREDIT"
                        ? "bg-success/10 text-success"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {tx.direction === "CREDIT" ? (
                      <ArrowDownLeft className="size-4" />
                    ) : (
                      <ArrowUpRight className="size-4" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{formatTransactionType(tx.type)}</p>
                    <p className="text-muted-foreground text-xs">{tx.createdAt.toLocaleString()}</p>
                  </div>
                </div>
                <span
                  className={cn(
                    "shrink-0 text-sm font-medium",
                    tx.direction === "CREDIT" && "text-success",
                  )}
                >
                  {tx.direction === "CREDIT" ? "+" : "−"}
                  {formatPaise(tx.amount.toString())}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
            <LifeBuoy className="size-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Need help?</h2>
            <p className="text-muted-foreground text-sm">
              A dedicated support channel hasn&apos;t been published yet. In the meantime, contact
              your account manager or the member who referred you for help with orders, payouts, or
              your account.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
