"use client";

import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { setCouponActiveAction } from "@/server/services/coupon-actions";

export function CouponToggle({ couponId, active }: { couponId: string; active: boolean }) {
  return (
    <ConfirmationDialog
      trigger={
        <Button variant="outline" size="sm">
          {active ? "Deactivate" : "Reactivate"}
        </Button>
      }
      title={active ? "Deactivate this coupon?" : "Reactivate this coupon?"}
      description={
        active
          ? "It can no longer be used at checkout. Past redemptions are kept."
          : "Customers can use it again within its dates and limits."
      }
      action={setCouponActiveAction}
      hiddenFields={{ couponId, active: active ? "false" : "true" }}
      confirmLabel={active ? "Deactivate" : "Reactivate"}
      successMessage={active ? "Coupon deactivated" : "Coupon reactivated"}
      variant={active ? "destructive" : "default"}
    />
  );
}
