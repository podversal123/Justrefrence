import { getT } from "@/i18n/server";
import type { Metadata, Route } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getAuthSession } from "@/server/auth/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getMemberIdentity,
  getMemberProfileByUserId,
  getUserPhone,
} from "@/server/repositories/identity/member-repository";
import { listAddresses } from "@/server/repositories/identity/address-repository";
import { listBankAccounts } from "@/server/repositories/identity/bank-repository";
import { getVendorProfileByUserId } from "@/server/repositories/vendor-repository";
import { ProfileForm } from "./profile-form";
import { ChangePasswordForm } from "./change-password-form";
import { MemberDetailsForm } from "./member-details-form";
import { AddressForm } from "./address-form";
import { BankAccountForm } from "./bank-account-form";
import { KycDocumentsCard } from "@/components/kyc/kyc-documents-card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Profile") };
}

const TABS = ["personal", "addresses", "bank", "kyc", "password"] as const;
type ProfileTab = (typeof TABS)[number];

const TAB_TRIGGER = "flex-none px-3 py-2 sm:px-4";

/**
 * One screen per topic instead of one very long page: Personal, Addresses, Bank and Password.
 * `?tab=bank` opens a tab directly, so a notification or a link can point straight at it.
 */
export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const t = await getT();
  const session = await getAuthSession();
  if (!session) redirect("/login");

  // Member-specific parts (details, addresses, bank) only apply to accounts that actually have a
  // member profile; a staff-only account has none.
  const memberProfile = await getMemberProfileByUserId(session.userId);
  const memberIdentity = memberProfile ? await getMemberIdentity(session.userId) : null;

  const [addresses, bankAccounts, contact, vendorProfile] = await Promise.all([
    memberProfile ? listAddresses(session.userId) : Promise.resolve([]),
    memberProfile ? listBankAccounts(session.userId) : Promise.resolve([]),
    getUserPhone(session.userId),
    session.hasVendorProfile ? getVendorProfileByUserId(session.userId) : Promise.resolve(null),
  ]);

  // A corporate (vendor) account banks in the company's name; a personal one in the member's own.
  const isCorporate = vendorProfile !== null;
  const bankHolderName = vendorProfile?.businessName ?? session.fullName ?? "";

  const residence = addresses.find((a) => a.type === "RESIDENCE") ?? null;
  const office = addresses.find((a) => a.type === "OFFICE") ?? null;
  const billing = addresses.find((a) => a.type === "BILLING") ?? null;

  const requested = (await searchParams)["tab"];
  const available: readonly ProfileTab[] = memberProfile ? TABS : ["personal", "password"];
  const activeTab = available.find((t) => t === requested) ?? "personal";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <h1>{t("Profile")}</h1>
        <p className="text-muted-foreground">
          {t("Your details, addresses, bank account and password.")}
        </p>
      </div>

      <Tabs defaultValue={activeTab} className="gap-6">
        <TabsList className="h-auto w-full justify-start overflow-x-auto sm:w-fit">
          <TabsTrigger value="personal" className={TAB_TRIGGER}>
            {t("Personal")}
          </TabsTrigger>
          {memberProfile ? (
            <TabsTrigger value="addresses" className={TAB_TRIGGER}>
              {t("Addresses")}
            </TabsTrigger>
          ) : null}
          {memberProfile ? (
            <TabsTrigger value="bank" className={TAB_TRIGGER}>
              {t("Bank")}
            </TabsTrigger>
          ) : null}
          {memberProfile ? (
            <TabsTrigger value="kyc" className={TAB_TRIGGER}>
              {t("KYC")}
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="password" className={TAB_TRIGGER}>
            {t("Password")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="personal">
          <div className="grid items-start gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t("Account")}</CardTitle>
                <CardDescription>{t("How you sign in and appear to others.")}</CardDescription>
              </CardHeader>
              <CardContent>
                <ProfileForm
                  email={session.email}
                  fullName={session.fullName}
                  mobile={contact.phone}
                  mobileVerified={Boolean(contact.phoneVerifiedAt)}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("Two-step login")}</CardTitle>
                <CardDescription>
                  {t(
                    "Adds a code from your phone to your password, so a stolen password is not enough.",
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link
                  href={"/two-step" as Route}
                  className={buttonVariants({ variant: "outline" })}
                >
                  {t("Manage two-step login")}
                </Link>
              </CardContent>
            </Card>

            {memberProfile ? (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle>{t("Member details")}</CardTitle>
                    <StatusBadge status={memberProfile.kycStatus} />
                  </div>
                  <CardDescription>
                    {t("Member ID")} <span className="font-mono">{memberProfile.memberId}</span> ·{" "}
                    {t("Referral ID")}{" "}
                    <span className="font-mono">{memberIdentity?.referralId ?? t("NA")}</span>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <a
                    href="/api/welcome-letter"
                    className="text-primary mb-4 inline-block text-sm font-medium underline-offset-4 hover:underline"
                  >
                    {t("Download your welcome letter (PDF)")}
                  </a>
                  <MemberDetailsForm
                    fullName={session.fullName}
                    dob={memberProfile.dob}
                    pan={memberProfile.pan}
                    gstin={memberProfile.gstin}
                    websiteUrl={memberProfile.websiteUrl}
                    socialLinks={
                      typeof memberProfile.socialLinks === "string"
                        ? memberProfile.socialLinks
                        : null
                    }
                    telephone={memberProfile.telephone}
                  />
                </CardContent>
              </Card>
            ) : null}
          </div>
        </TabsContent>

        {memberProfile ? (
          <TabsContent value="addresses">
            <div className="grid items-start gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>{t("Residence address")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <AddressForm type="RESIDENCE" address={residence} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("Office / business address")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <AddressForm type="OFFICE" address={office} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("Billing address")}</CardTitle>
                  <CardDescription>{t("Shown on your invoices.")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <AddressForm type="BILLING" address={billing} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        ) : null}

        {memberProfile ? (
          <TabsContent value="bank">
            <Card className="max-w-3xl">
              <CardHeader>
                <CardTitle>{t("Bank details")}</CardTitle>
                <CardDescription>
                  {t("Used for payouts. Your account number is stored encrypted.")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BankAccountForm
                  bankAccounts={bankAccounts}
                  defaultHolderName={bankHolderName}
                  isCorporate={isCorporate}
                />
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}

        {memberProfile ? (
          <TabsContent value="kyc">
            <KycDocumentsCard ownerUserId={session.userId} isVendor={session.hasVendorProfile} />
          </TabsContent>
        ) : null}

        <TabsContent value="password">
          <Card className="max-w-3xl">
            <CardHeader>
              <CardTitle>{t("Change password")}</CardTitle>
              <CardDescription>
                {t("You need your current password to set a new one.")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChangePasswordForm />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
