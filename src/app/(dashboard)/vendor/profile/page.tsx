import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/server/auth/session";
import { getVendorProfileByUserId } from "@/server/repositories/vendor-repository";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VendorProfileForm } from "./vendor-profile-form";

export const metadata: Metadata = { title: "My vendor profile" };

const STATUS_VARIANT = {
  APPROVED: "default",
  PENDING: "secondary",
  REJECTED: "destructive",
  SUSPENDED: "destructive",
} as const;

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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
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
          <Badge variant={STATUS_VARIANT[vendorProfile.approvalStatus]}>
            {vendorProfile.approvalStatus}
          </Badge>
        </CardHeader>
        <CardContent>
          <VendorProfileForm businessName={vendorProfile.businessName} />
        </CardContent>
      </Card>

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
