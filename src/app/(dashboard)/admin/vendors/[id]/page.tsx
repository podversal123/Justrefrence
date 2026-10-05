import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Package, Briefcase, Wrench } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import { getVendorDetail } from "@/server/repositories/vendor-repository";
import { listRoles } from "@/server/repositories/role-repository";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RoleManager } from "@/components/admin/role-manager";
import { VendorStatusActions } from "./vendor-status-actions";

export const metadata: Metadata = { title: "Vendor details" };

const STATUS_VARIANT = {
  APPROVED: "default",
  PENDING: "secondary",
  REJECTED: "destructive",
  SUSPENDED: "destructive",
} as const;

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function VendorDetailPage({ params }: PageProps) {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("member:read:any")) redirect("/unauthorized");

  const { id } = await params;
  const vendor = await getVendorDetail(id);
  if (!vendor) notFound();

  const roles = await listRoles();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>{vendor.businessName}</h1>
          <p className="text-muted-foreground">
            {vendor.user.fullName ?? "—"} · {vendor.user.email}
          </p>
        </div>
        <Badge variant={STATUS_VARIANT[vendor.approvalStatus]} className="text-sm">
          {vendor.approvalStatus}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
          <CardDescription>
            {vendor.approvalStatus === "REJECTED" && vendor.rejectedReason
              ? `Rejected: ${vendor.rejectedReason}`
              : vendor.approver
                ? `Last changed by ${vendor.approver.fullName ?? vendor.approver.email}`
                : "Awaiting review."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VendorStatusActions
            vendorProfileId={vendor.id}
            status={vendor.approvalStatus}
            canApprove={session.permissions.has("vendor:approve")}
            canReject={session.permissions.has("vendor:reject")}
            canSuspend={session.permissions.has("vendor:suspend")}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Roles</CardTitle>
          <CardDescription>What this vendor account can do — see docs/rbac.md.</CardDescription>
        </CardHeader>
        <CardContent>
          {session.permissions.has("role:assign") ? (
            <RoleManager
              userId={vendor.user.id}
              currentGrants={vendor.user.userRoles}
              allRoles={roles}
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              {vendor.user.userRoles.map((ur) => (
                <Badge key={ur.id} variant="secondary">
                  {ur.role.label}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
        </TabsList>
        <TabsContent value="products">
          <EmptyState
            icon={Package}
            title="No products yet"
            description="Product listings ship in Phase 3 (Product/Project/Service masters) — this tab is wired up and ready for that data."
          />
        </TabsContent>
        <TabsContent value="services">
          <EmptyState
            icon={Wrench}
            title="No services yet"
            description="Service listings ship in Phase 3 (Product/Project/Service masters) — this tab is wired up and ready for that data."
          />
        </TabsContent>
        <TabsContent value="projects">
          <EmptyState
            icon={Briefcase}
            title="No projects yet"
            description="Project listings ship in Phase 3 (Product/Project/Service masters) — this tab is wired up and ready for that data."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
