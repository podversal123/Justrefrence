import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/server/auth/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { getMemberProfileByUserId } from "@/server/repositories/identity/member-repository";
import { listAddresses } from "@/server/repositories/identity/address-repository";
import { getBankAccount } from "@/server/repositories/identity/bank-repository";
import { ProfileForm } from "./profile-form";
import { ChangePasswordForm } from "./change-password-form";
import { MemberDetailsForm } from "./member-details-form";
import { AddressForm } from "./address-form";
import { BankAccountForm } from "./bank-account-form";

export const metadata: Metadata = { title: "My profile" };

export default async function ProfilePage() {
  const session = await getAuthSession();
  if (!session) redirect("/login");

  // Member-specific cards (KYC, addresses, bank) only apply to accounts
  // that actually have a member profile (i.e. registered via Phase 4
  // self-registration) — a staff-only admin/vendor account has none.
  const memberProfile = await getMemberProfileByUserId(session.userId);

  const [addresses, bankAccount] = memberProfile
    ? await Promise.all([listAddresses(session.userId), getBankAccount(session.userId)])
    : [[], null];

  const residence = addresses.find((a) => a.type === "RESIDENCE") ?? null;
  const office = addresses.find((a) => a.type === "OFFICE") ?? null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1>My profile</h1>
        <p className="text-muted-foreground">Manage your account details and password.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>This is how you appear to other admins.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm email={session.email} fullName={session.fullName} />
        </CardContent>
      </Card>

      {memberProfile ? (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Member details</CardTitle>
                <StatusBadge status={memberProfile.kycStatus} />
              </div>
              <CardDescription>
                Member ID <span className="font-mono">{memberProfile.memberId}</span> · Referral
                code <span className="font-mono">{memberProfile.referralCode}</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MemberDetailsForm
                fullName={session.fullName}
                dob={memberProfile.dob}
                pan={memberProfile.pan}
                gstin={memberProfile.gstin}
                websiteUrl={memberProfile.websiteUrl}
                socialLinks={typeof memberProfile.socialLinks === "string" ? memberProfile.socialLinks : null}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Residence address</CardTitle>
            </CardHeader>
            <CardContent>
              <AddressForm type="RESIDENCE" address={residence} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Office / business address</CardTitle>
            </CardHeader>
            <CardContent>
              <AddressForm type="OFFICE" address={office} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Bank details</CardTitle>
              <CardDescription>Used for payouts. Account number is encrypted at rest.</CardDescription>
            </CardHeader>
            <CardContent>
              <BankAccountForm bankAccount={bankAccount} />
            </CardContent>
          </Card>
        </>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>Requires your current password.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
