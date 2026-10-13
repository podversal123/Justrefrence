import { StatusBadge } from "@/components/ui/status-badge";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/server/auth/session";
import { getVendorProfileByUserId } from "@/server/repositories/vendor-repository";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { VendorProfileForm } from "./vendor-profile-form";
import { KycDocumentsCard } from "@/components/kyc/kyc-documents-card";

export const metadata: Metadata = { title: "My vendor profile" };

export default async function VendorProfilePage() {
  const session = await getAuthSession();
  if (!session) redirect("/login");

  // Ownership is implicit: we only ever look up the CALLER's own vendor
  // profile, never one passed in from the client — see
  // src/server/services/vendor-actions.ts for the write-side of this same
  // guarantee.
  const vendorProfile = await getVendorProfileByUserId(session.userId);
  if (!vendorProfile) redirect("/unauthorized");

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1>My vendor profile</h1>
        <p className="text-muted-foreground">
          Your business details, visible to Justreference admins.
        </p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Business profile</CardTitle>
            <CardDescription>Status is managed by an admin.</CardDescription>
          </div>
          <StatusBadge status={vendorProfile.approvalStatus} />
        </CardHeader>
        <CardContent>
          <VendorProfileForm
            values={{
              businessName: vendorProfile.businessName,
              phone: vendorProfile.phone,
              telephone: vendorProfile.telephone,
              gstin: vendorProfile.gstin,
              pan: vendorProfile.pan,
            }}
          />
        </CardContent>
      </Card>

      <KycDocumentsCard ownerUserId={session.userId} isVendor title="Business documents" />

      {vendorProfile.approvalStatus === "REJECTED" && vendorProfile.rejectedReason ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive text-sm">Rejection reason</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            {vendorProfile.rejectedReason}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
