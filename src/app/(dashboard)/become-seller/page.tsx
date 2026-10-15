import { msg } from "@/i18n/locales";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Clock, Store, XCircle } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import { isStaff } from "@/server/auth/panel";
import { getVendorProfileByUserId } from "@/server/repositories/vendor-repository";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { SellerApplicationForm } from "./seller-application-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Become a seller") };
}

const STEPS = [
  msg("Tell us about your business below."),
  msg("Our team looks at your request."),
  msg("Once approved, a switch appears in your menu to open the Seller / Vendor panel."),
];

export default async function BecomeSellerPage() {
  const t = await getT();
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (isStaff(session) || !session.permissions.has("vendor:apply")) redirect("/unauthorized");

  const vendor = await getVendorProfileByUserId(session.userId);
  const status = vendor?.approvalStatus;
  const isSeller = session.roles.includes("VENDOR");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1>{t("Become a seller")}</h1>
        <p className="text-muted-foreground">
          {t("Sell your products, services and projects on Justreference.")}
        </p>
      </div>

      {isSeller && status === "APPROVED" ? (
        <Card>
          <CardHeader className="flex-row items-start gap-3 space-y-0">
            <CheckCircle2 className="text-success mt-0.5 size-5" aria-hidden="true" />
            <div>
              <CardTitle className="text-base">{t("You are a seller")}</CardTitle>
              <CardDescription>
                {t("Use the switch at the bottom of the menu to open your Seller / Vendor panel.")}
              </CardDescription>
            </div>
          </CardHeader>
        </Card>
      ) : status === "PENDING" ? (
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div className="flex items-start gap-3">
              <Clock className="text-warning mt-0.5 size-5" aria-hidden="true" />
              <div>
                <CardTitle className="text-base">{t("Your request is with our team")}</CardTitle>
                <CardDescription>
                  {t("We will tell you here and in your notifications as soon as it is decided.")}
                </CardDescription>
              </div>
            </div>
            <StatusBadge status="PENDING" />
          </CardHeader>
          <CardContent className="text-sm">
            <p className="font-medium">{vendor?.businessName}</p>
          </CardContent>
        </Card>
      ) : status === "SUSPENDED" ? (
        <Card>
          <CardHeader className="flex-row items-start gap-3 space-y-0">
            <XCircle className="text-destructive mt-0.5 size-5" aria-hidden="true" />
            <div>
              <CardTitle className="text-base">{t("Your seller account is on hold")}</CardTitle>
              <CardDescription>
                {t("Please contact support to find out why and how to get it back.")}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/support">{t("Contact support")}</Link>}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {status === "REJECTED" ? (
            <Card>
              <CardHeader className="flex-row items-start gap-3 space-y-0">
                <XCircle className="text-destructive mt-0.5 size-5" aria-hidden="true" />
                <div>
                  <CardTitle className="text-base">{t("Your last request was not approved")}</CardTitle>
                  {vendor?.rejectedReason ? (
                    <CardDescription>{vendor.rejectedReason}</CardDescription>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="text-muted-foreground text-sm">
                {t("You can fix the details and send the request again.")}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Store className="size-4" aria-hidden="true" />
                  {t("How it works")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="text-muted-foreground list-decimal space-y-1 pl-5 text-sm">
                  {STEPS.map((step) => (
                    <li key={step}>{t(step)}</li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("Your business")}</CardTitle>
            </CardHeader>
            <CardContent>
              <SellerApplicationForm
                resubmit={status === "REJECTED"}
                values={
                  vendor
                    ? { businessName: vendor.businessName, phone: vendor.phone, gstin: vendor.gstin }
                    : undefined
                }
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
