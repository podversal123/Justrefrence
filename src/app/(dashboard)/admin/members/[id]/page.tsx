import { getFormat, getT } from "@/i18n/server";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, FileText, Mail } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import { getMemberDetail } from "@/server/repositories/identity/member-admin-repository";
import { listDocumentsForOwner } from "@/server/repositories/kyc/kyc-repository";
import { DOCUMENT_LABELS } from "@/server/domain/kyc/rules";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatPaise } from "@/lib/money";
import { hasWalletPin } from "@/server/repositories/wallet/wallet-repository";
import { ModerationButton } from "./moderation-button";
import { ResetWalletPinButton } from "./reset-wallet-pin-button";
import { EditMemberDialog } from "./edit-member-dialog";
import { PendingChangeBanner } from "@/components/approvals/pending-change-banner";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Member") };
}

const maskPan = (pan: string | null, notProvided: string) =>
  pan ? `${"•".repeat(Math.max(pan.length - 4, 0))}${pan.slice(-4)}` : notProvided;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 border-b py-2 text-sm last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

export default async function AdminMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const { formatDate } = await getFormat();
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("member:read:any")) redirect("/unauthorized");

  const { id } = await params;
  const detail = await getMemberDetail(id).catch(() => null);
  if (!detail) notFound();
  const { user, directReferrals } = detail;
  const kycDocuments = await listDocumentsForOwner(user.id);
  const profile = user.memberProfile!;
  const blocked = user.status === "BLOCKED";
  const bank = user.bankAccounts[0];
  const isSelf = user.id === session.userId;
  const memberHasPin = await hasWalletPin(user.id);
  const canResetPin = session.permissions.has("wallet_pin:reset") && !isSelf && memberHasPin;
  const canModerate =
    session.permissions.has(blocked ? "member:unblock" : "member:block") && !isSelf;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <Link
        href="/admin/members"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" />
        {t("All members")}
      </Link>

      <PendingChangeBanner entityType="MEMBER_PROFILE" entityId={user.id} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1>{user.fullName ?? user.email}</h1>
            <StatusBadge status={user.status} />
          </div>
          <p className="text-muted-foreground text-sm">
            {profile.memberId} · {t("Joined {date}", { date: formatDate(user.createdAt) })}
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
                  {t("Send message")}
                </Link>
              }
            />
          ) : null}
          <Button
            variant="outline"
            nativeButton={false}
            render={
              <a href={`/api/welcome-letter?member=${user.id}`}>
                <FileText />
                {t("Welcome letter")}
              </a>
            }
          />
          {session.permissions.has("member:update:any") && !isSelf ? (
            <EditMemberDialog
              needsApproval={!session.permissions.has("change:apply_direct")}
              member={{
                userId: user.id,
                fullName: user.fullName ?? "",
                dob: profile.dob ? profile.dob.toISOString().slice(0, 10) : "",
                pan: profile.pan ?? "",
                gstin: profile.gstin ?? "",
                websiteUrl: profile.websiteUrl ?? "",
                socialLinks: typeof profile.socialLinks === "string" ? profile.socialLinks : "",
                telephone: profile.telephone ?? "",
              }}
            />
          ) : null}
          {canResetPin ? <ResetWalletPinButton userId={user.id} /> : null}
          {canModerate ? <ModerationButton userId={user.id} blocked={blocked} /> : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("Profile")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl>
              <Row label={t("Email")}>{user.email}</Row>
              <Row label={t("Mobile")}>{user.phone ?? t("Not provided")}</Row>
              <Row label={t("Telephone")}>{profile.telephone ?? t("Not provided")}</Row>
              <Row label={t("Email verified")}>
                {user.emailVerifiedAt ? formatDate(user.emailVerifiedAt) : t("No")}
              </Row>
              <Row label={t("KYC")}>
                <StatusBadge status={profile.kycStatus} />
              </Row>
              <Row label={t("PAN")}>{maskPan(profile.pan, t("Not provided"))}</Row>
              <Row label={t("GSTIN")}>{profile.gstin ?? "Not provided"}</Row>
              <Row label={t("Referral code")}>{profile.referralCode ?? "—"}</Row>
              <Row label={t("Referred by")}>
                {profile.referredByUser
                  ? (profile.referredByUser.fullName ?? profile.referredByUser.email)
                  : t("Direct signup")}
              </Row>
              <Row label={t("Roles")}>
                {user.userRoles.map((r) => r.role.code).join(", ") || "—"}
              </Row>
            </dl>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("Wallet")}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl>
                <Row label={t("Balance")}>
                  {formatPaise((user.wallet?.balance ?? 0n).toString(), "INR")}
                </Row>
                <Row label={t("On hold for payouts")}>
                  {formatPaise((user.wallet?.pendingBalance ?? 0n).toString(), "INR")}
                </Row>
                <Row label={t("Wallet PIN")}>{memberHasPin ? t("Set") : t("Not set")}</Row>
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("Bank account")}</CardTitle>
            </CardHeader>
            <CardContent>
              {bank ? (
                <dl>
                  <Row label={t("Holder")}>{bank.accountHolderName}</Row>
                  <Row label={t("Account")}>{bank.accountNoMasked}</Row>
                  <Row label={t("IFSC")}>{bank.ifsc}</Row>
                  <Row label={t("Verified")}>
                    {bank.verifiedAt ? formatDate(bank.verifiedAt) : t("Not yet")}
                  </Row>
                </dl>
              ) : (
                <p className="text-muted-foreground text-sm">{t("No bank account added.")}</p>
              )}
            </CardContent>
          </Card>
          {user.vendorProfile ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("Vendor")}</CardTitle>
              </CardHeader>
              <CardContent>
                <dl>
                  <Row label={t("Business")}>{user.vendorProfile.businessName}</Row>
                  <Row label={t("Approval")}>
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
          <CardTitle>{t("KYC documents")}</CardTitle>
        </CardHeader>
        <CardContent>
          {kycDocuments.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("No documents uploaded yet.")}</p>
          ) : (
            <ul className="divide-y">
              {kycDocuments.map((doc) => (
                <li
                  key={doc.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <span>{DOCUMENT_LABELS[doc.type]}</span>
                  <span className="flex items-center gap-3">
                    <StatusBadge status={doc.status} />
                    {session.permissions.has("kyc:review") ? (
                      <a
                        href={`/api/kyc/${doc.id}/file`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary font-medium hover:underline"
                      >
                        {t("View")}
                      </a>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {session.permissions.has("kyc:review") ? (
            <p className="text-muted-foreground mt-3 text-xs">
              {t("To verify or reject, open")}{" "}
              <Link href={"/admin/kyc" as Route} className="text-primary hover:underline">
                {t("KYC review")}
              </Link>
              .
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {t("Direct referrals ({count})", { count: directReferrals.length })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {directReferrals.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t("This member hasn't referred anyone yet.")}
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
