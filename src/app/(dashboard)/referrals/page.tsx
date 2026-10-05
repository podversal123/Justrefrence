import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/server/auth/session";
import { getReferralDashboard } from "@/server/domain/referral/referral-service";
import { formatPaise } from "@/lib/money";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Users } from "lucide-react";
import { CopyLinkButton } from "./copy-link-button";

export const metadata: Metadata = { title: "My referrals" };

export default async function ReferralsPage() {
  const session = await getAuthSession();
  if (!session) redirect("/login");

  const appBaseUrl = process.env["APP_BASE_URL"] ?? "http://localhost:3000";

  let dashboard;
  try {
    dashboard = await getReferralDashboard(session.userId, appBaseUrl);
  } catch {
    redirect("/dashboard");
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <div>
        <h1>My referrals</h1>
        <p className="text-muted-foreground">
          Member ID <span className="font-mono">{dashboard.memberId}</span> · Referral code{" "}
          <span className="font-mono">{dashboard.referralCode}</span>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your referral link</CardTitle>
          <CardDescription>Share this link — anyone who registers through it becomes your direct referral.</CardDescription>
        </CardHeader>
        <CardContent>
          <CopyLinkButton link={dashboard.referralLink} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-sm">Direct referrals</p>
            <p className="text-2xl font-semibold">{dashboard.directReferralCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-sm">Indirect referrals</p>
            <p className="text-2xl font-semibold">{dashboard.indirectReferralCount}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Commission summary</CardTitle>
          <CardDescription>
            Commissions are confirmed when the order completes, then become available after a short
            release window.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dashboard.commissionSummary.length === 0 ? (
            <p className="text-muted-foreground text-sm">No commissions yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {dashboard.commissionSummary.map((row) => (
                <div key={row.status} className="rounded-lg border p-3">
                  <StatusBadge status={row.status} />
                  <p className="mt-2 text-lg font-semibold">{formatPaise(row.totalAmount.toString())}</p>
                  <p className="text-muted-foreground text-xs">
                    {row.count} commission{row.count === 1 ? "" : "s"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Direct referrals</CardTitle>
        </CardHeader>
        <CardContent>
          {dashboard.directReferrals.length === 0 ? (
            <EmptyState icon={Users} title="No direct referrals yet" description="Share your link to get started." />
          ) : (
            <div className="flex flex-col gap-2">
              {dashboard.directReferrals.map((r) => (
                <div key={r.member.id} className="flex items-center justify-between text-sm">
                  <span>{r.member.user.fullName ?? r.member.user.email}</span>
                  <span className="text-muted-foreground font-mono text-xs">
                    {r.member.memberId} · {r.member.createdAt.toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Referral tree</CardTitle>
          <CardDescription>Everyone in your downline, direct and indirect.</CardDescription>
        </CardHeader>
        <CardContent>
          {dashboard.tree.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nobody in your tree yet.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {dashboard.tree.map((m) => (
                <div key={m.id} className="flex items-center justify-between text-sm">
                  <span>{m.user.fullName ?? m.user.email}</span>
                  <span className="text-muted-foreground font-mono text-xs">{m.memberId}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Referral history</CardTitle>
        </CardHeader>
        <CardContent>
          {dashboard.history.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nothing yet.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {dashboard.history.map((h) => (
                <div key={h.id} className="flex items-center justify-between text-sm">
                  <span>{h.member.user.fullName ?? h.member.user.email} joined your referral</span>
                  <span className="text-muted-foreground text-xs">{h.changedAt?.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
