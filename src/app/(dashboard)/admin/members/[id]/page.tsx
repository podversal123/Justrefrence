import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Mail } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import { getMemberDetail } from "@/server/repositories/identity/member-admin-repository";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import { ModerationButton } from "./moderation-button";

export const metadata: Metadata = { title: "Member" };

const maskPan = (pan: string | null) =>
  pan ? `${"•".repeat(Math.max(pan.length - 4, 0))}${pan.slice(-4)}` : "Not provided";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 border-b py-2 text-sm last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

export default async function AdminMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("member:read:any")) redirect("/unauthorized");

  const { id } = await params;
  const detail = await getMemberDetail(id).catch(() => null);
  if (!detail) notFound();
  const { user, directReferrals } = detail;
  const profile = user.memberProfile!;
  const blocked = user.status === "BLOCKED";
  const bank = user.bankAccounts[0];
  const isSelf = user.id === session.userId;
  const canModerate =
    session.permissions.has(blocked ? "member:unblock" : "member:block") && !isSelf;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <Link
        href="/admin/members"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" />
        All members
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1>{user.fullName ?? user.email}</h1>
            <StatusBadge status={user.status} />
          </div>
          <p className="text-muted-foreground text-sm">
            {profile.memberId} · Joined {formatDate(user.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {session.permissions.has("message:send") ? (
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <Link href={`/messages?to=${user.id}` as Route}>
                  <Mail />
                  Send message
                </Link>
              }
            />
          ) : null}
          {canModerate ? <ModerationButton userId={user.id} blocked={blocked} /> : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <dl>
              <Row label="Email">{user.email}</Row>
              <Row label="Mobile">{user.phone ?? "Not provided"}</Row>
              <Row label="Email verified">
                {user.emailVerifiedAt ? formatDate(user.emailVerifiedAt) : "No"}
              </Row>
              <Row label="KYC">
                <StatusBadge status={profile.kycStatus} />
              </Row>
              <Row label="PAN">{maskPan(profile.pan)}</Row>
              <Row label="GSTIN">{profile.gstin ?? "Not provided"}</Row>
              <Row label="Referral code">{profile.referralCode ?? "—"}</Row>
              <Row label="Referred by">
                {profile.referredByUser
                  ? (profile.referredByUser.fullName ?? profile.referredByUser.email)
                  : "Direct signup"}
              </Row>
              <Row label="Roles">{user.userRoles.map((r) => r.role.code).join(", ") || "—"}</Row>
            </dl>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Wallet</CardTitle>
            </CardHeader>
            <CardContent>
              <dl>
                <Row label="Balance">
                  {formatPaise((user.wallet?.balance ?? 0n).toString(), "INR")}
                </Row>
                <Row label="On hold for payouts">
                  {formatPaise((user.wallet?.pendingBalance ?? 0n).toString(), "INR")}
                </Row>
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Bank account</CardTitle>
            </CardHeader>
            <CardContent>
              {bank ? (
                <dl>
                  <Row label="Holder">{bank.accountHolderName}</Row>
                  <Row label="Account">{bank.accountNoMasked}</Row>
                  <Row label="IFSC">{bank.ifsc}</Row>
                  <Row label="Verified">
                    {bank.verifiedAt ? formatDate(bank.verifiedAt) : "Not yet"}
                  </Row>
                </dl>
              ) : (
                <p className="text-muted-foreground text-sm">No bank account added.</p>
              )}
            </CardContent>
          </Card>
          {user.vendorProfile ? (
            <Card>
              <CardHeader>
                <CardTitle>Vendor</CardTitle>
              </CardHeader>
              <CardContent>
                <dl>
                  <Row label="Business">{user.vendorProfile.businessName}</Row>
                  <Row label="Approval">
                    <StatusBadge status={user.vendorProfile.approvalStatus} />
                  </Row>
                </dl>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Direct referrals ({directReferrals.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {directReferrals.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              This member hasn&apos;t referred anyone yet.
            </p>
          ) : (
            <ul className="divide-y">
              {directReferrals.map((r) => (
                <li
                  key={r.memberId ?? r.user.email}
                  className="flex flex-wrap justify-between gap-2 py-2 text-sm"
                >
                  <span>{r.user.fullName ?? r.user.email}</span>
                  <span className="text-muted-foreground">
                    {r.memberId} · {formatDate(r.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
