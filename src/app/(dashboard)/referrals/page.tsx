import { getFormat, getT } from "@/i18n/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/server/auth/session";
import { getReferralDashboard } from "@/server/domain/referral/referral-service";
import { getMemberIdentity } from "@/server/repositories/identity/member-repository";
import { MemberIds } from "@/components/member/member-ids";
import { formatPaise } from "@/lib/money";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Users } from "lucide-react";
import { CopyLinkButton } from "./copy-link-button";
import { ShareLinks } from "./share-links";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Referrals") };
}

export default async function ReferralsPage() {
  const t = await getT();
  const { formatDate } = await getFormat();
  const session = await getAuthSession();
  if (!session) redirect("/login");

  const appBaseUrl = process.env["APP_BASE_URL"] ?? "http://localhost:3000";

  let dashboard;
  try {
    dashboard = await getReferralDashboard(session.userId, appBaseUrl);
  } catch {
    redirect("/dashboard");
  }

  const identity = await getMemberIdentity(session.userId);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <div>
        <h1>{t("Referrals")}</h1>
        <MemberIds
          memberId={dashboard.memberId ?? ""}
          referralId={identity?.referralId ?? null}
          className="mt-2"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Your referral link")}</CardTitle>
          <CardDescription>
            {t("Share this link. Anyone who registers through it becomes your direct referral.")}
          </CardDescription>
        </CardHeader>
        <CardContent id="create" className="scroll-mt-20 space-y-3">
          <CopyLinkButton link={dashboard.referralLink} />
          <ShareLinks link={dashboard.referralLink} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-sm">{t("Direct referrals")}</p>
            <p className="text-2xl font-semibold">{dashboard.directReferralCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-sm">{t("Indirect referrals")}</p>
            <p className="text-2xl font-semibold">{dashboard.indirectReferralCount}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Commission summary")}</CardTitle>
          <CardDescription>
            {t(
              "Commissions are confirmed when the order completes, then become available after a short release window.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dashboard.commissionSummary.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("No commissions yet.")}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {dashboard.commissionSummary.map((row) => (
                <div key={row.status} className="rounded-lg border p-3">
                  <StatusBadge status={row.status} />
                  <p className="mt-2 text-lg font-semibold">
                    {formatPaise(row.totalAmount.toString())}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {row.count === 1
                      ? t("1 commission")
                      : t("{count} commissions", { count: row.count })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Direct referrals")}</CardTitle>
        </CardHeader>
        <CardContent>
          {dashboard.directReferrals.length === 0 ? (
            <EmptyState
              icon={Users}
              title={t("No direct referrals yet")}
              description={t("Share your link to get started.")}
            />
          ) : (
            <div className="flex flex-col gap-2">
              {dashboard.directReferrals.map((r) => (
                <div key={r.member.id} className="flex items-center justify-between text-sm">
                  <span>{r.member.user.fullName ?? r.member.user.email}</span>
                  <span className="text-muted-foreground font-mono text-xs">
                    {r.member.memberId} · {formatDate(r.member.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Referral tree")}</CardTitle>
          <CardDescription>{t("Everyone in your downline, direct and indirect.")}</CardDescription>
        </CardHeader>
        <CardContent>
          {dashboard.tree.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("Nobody in your tree yet.")}</p>
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
          <CardTitle className="text-base">{t("Referral history")}</CardTitle>
        </CardHeader>
        <CardContent>
          {dashboard.history.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("Nothing yet.")}</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {dashboard.history.map((h) => (
                <div key={h.id} className="flex items-center justify-between text-sm">
                  <span>
                    {t("{name} joined your referral", {
                      name: h.member.user.fullName ?? h.member.user.email,
                    })}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {h.changedAt?.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
