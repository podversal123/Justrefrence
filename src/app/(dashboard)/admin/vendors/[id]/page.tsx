import { getT } from "@/i18n/server";
import { EditVendorDialog } from "./edit-vendor-dialog";
import { PendingChangeBanner } from "@/components/approvals/pending-change-banner";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Package, Briefcase, Wrench } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import Link from "next/link";
import type { Route } from "next";
import {
  getVendorDetail,
  listVendorListingSummaries,
  type VendorListingSummary,
} from "@/server/repositories/vendor-repository";
import { formatPaise } from "@/lib/money";
import { maskPan } from "@/server/domain/identity/masking";
import { listRoles } from "@/server/repositories/role-repository";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RoleManager } from "@/components/admin/role-manager";
import { VendorStatusActions } from "./vendor-status-actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Vendor details") };
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function VendorDetailPage({ params }: PageProps) {
  const t = await getT();
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("member:read:any")) redirect("/unauthorized");

  const { id } = await params;
  const vendor = await getVendorDetail(id);
  if (!vendor) notFound();

  const [roles, listings] = await Promise.all([listRoles(), listVendorListingSummaries(id)]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PendingChangeBanner entityType="VENDOR_PROFILE" entityId={vendor.id} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>{vendor.businessName}</h1>
          <p className="text-muted-foreground">
            {vendor.user.fullName ?? "—"} · {vendor.user.email}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={vendor.approvalStatus} className="text-sm" />
          {session.permissions.has("vendor:update:any") ? (
            <EditVendorDialog
              needsApproval={!session.permissions.has("change:apply_direct")}
              vendor={{
                vendorProfileId: vendor.id,
                businessName: vendor.businessName,
                phone: vendor.phone ?? "",
                telephone: vendor.telephone ?? "",
                gstin: vendor.gstin ?? "",
                pan: vendor.pan ?? "",
              }}
            />
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("Status")}</CardTitle>
          <CardDescription>{statusNote(vendor)}</CardDescription>
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
          <CardTitle>{t("Contact and tax details")}</CardTitle>
          <CardDescription>{t("As entered by the vendor.")}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            <ContactRow label={t("Contact person")} value={vendor.user.fullName} />
            <ContactRow label={t("Email")} value={vendor.user.email} />
            <ContactRow label={t("Business mobile")} value={vendor.phone} />
            <ContactRow label={t("Telephone")} value={vendor.telephone} />
            <ContactRow label={t("GSTIN")} value={vendor.gstin} />
            <ContactRow label={t("Business PAN")} value={vendor.pan ? maskPan(vendor.pan) : null} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("Roles")}</CardTitle>
          <CardDescription>{t("What this vendor account can do.")}</CardDescription>
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
          <TabsTrigger value="products">{t("Products")}</TabsTrigger>
          <TabsTrigger value="services">{t("Services")}</TabsTrigger>
          <TabsTrigger value="projects">{t("Projects")}</TabsTrigger>
        </TabsList>
        <TabsContent value="products">
          <ListingList kind="products" items={listings.products} icon={Package} noun="products" />
        </TabsContent>
        <TabsContent value="services">
          <ListingList kind="services" items={listings.services} icon={Wrench} noun="services" />
        </TabsContent>
        <TabsContent value="projects">
          <ListingList kind="projects" items={listings.projects} icon={Briefcase} noun="projects" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

async function ListingList({
  kind,
  items,
  icon,
  noun,
}: {
  kind: "products" | "services" | "projects";
  items: VendorListingSummary[];
  icon: typeof Package;
  noun: string;
}) {
  const t = await getT();
  if (items.length === 0) {
    return (
      <EmptyState
        icon={icon}
        title={`No ${noun} yet`}
        description={`This vendor hasn't listed any ${noun}.`}
      />
    );
  }
  return (
    <ul className="surface-card divide-y">
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link
            href={`/admin/catalog/${kind}/${item.id}` as Route}
            className="min-w-0 truncate text-sm font-medium hover:underline"
          >
            {item.title}
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground tabular-nums">
              {item.price === null ? t("Quote on request") : formatPaise(item.price)}
            </span>
            <Badge variant="outline">
              {item.isActive ? item.approvalStatus.toLowerCase() : "inactive"}
            </Badge>
          </div>
        </li>
      ))}
    </ul>
  );
}

async function ContactRow({ label, value }: { label: string; value: string | null | undefined }) {
  const t = await getT();
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-medium">
        {value || <span className="text-muted-foreground">{t("Not added")}</span>}
      </dd>
    </div>
  );
}

/** One plain sentence about where this vendor stands. */
function statusNote(vendor: {
  approvalStatus: string;
  rejectedReason: string | null;
  approver: { fullName: string | null; email: string } | null;
}): string {
  if (vendor.approvalStatus === "REJECTED" && vendor.rejectedReason) {
    return `Rejected: ${vendor.rejectedReason}`;
  }
  if (vendor.approver) {
    return `Last changed by ${vendor.approver.fullName ?? vendor.approver.email}.`;
  }
  switch (vendor.approvalStatus) {
    case "PENDING":
      return "Waiting for review.";
    case "APPROVED":
      return "Approved.";
    case "SUSPENDED":
      return "Suspended.";
    default:
      return "Rejected.";
  }
}
