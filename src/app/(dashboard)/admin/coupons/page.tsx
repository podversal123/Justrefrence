import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TicketPercent } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import { listCouponsForAdmin } from "@/server/repositories/commerce/coupon-admin-repository";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { couponState, describeDiscount } from "@/lib/coupon-display";
import { formatDate } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import { CouponToggle } from "./coupon-toggle";
import { CreateCouponDialog } from "./create-coupon-dialog";

export const metadata: Metadata = { title: "Coupons" };

export default async function AdminCouponsPage() {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("coupon:read")) redirect("/unauthorized");

  const canCreate = session.permissions.has("coupon:create");
  const canUpdate = session.permissions.has("coupon:update");
  const coupons = await listCouponsForAdmin();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1>Coupons</h1>
          <p className="text-muted-foreground">
            Discount codes customers apply at checkout, and how often each has been used.
          </p>
        </div>
        {canCreate ? <CreateCouponDialog /> : null}
      </div>

      {coupons.length === 0 ? (
        <EmptyState
          icon={TicketPercent}
          title="No coupons yet"
          description="Create a code to offer a percentage or fixed discount."
          action={canCreate ? <CreateCouponDialog /> : undefined}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Discount</TableHead>
              <TableHead>Minimum order</TableHead>
              <TableHead>Valid</TableHead>
              <TableHead>Used</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {coupons.map((coupon) => {
              const state = couponState(coupon);
              return (
                <TableRow key={coupon.id}>
                  <TableCell className="font-mono text-sm font-medium">{coupon.code}</TableCell>
                  <TableCell>{describeDiscount(coupon)}</TableCell>
                  <TableCell className="tabular-nums">
                    {coupon.minOrderAmount > 0n
                      ? formatPaise(coupon.minOrderAmount.toString(), "INR")
                      : "None"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(coupon.startsAt)} –{" "}
                    {coupon.expiresAt ? formatDate(coupon.expiresAt) : "no end date"}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {coupon._count.redemptions}
                    {coupon.usageLimit !== null ? ` / ${coupon.usageLimit}` : ""}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={state} />
                  </TableCell>
                  <TableCell>
                    {canUpdate ? (
                      <CouponToggle couponId={coupon.id} active={!coupon.deletedAt} />
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
