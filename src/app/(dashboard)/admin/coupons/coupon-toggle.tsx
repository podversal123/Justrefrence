"use client";

import { useT } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { setCouponActiveAction } from "@/server/services/coupon-actions";

export function CouponToggle({ couponId, active }: { couponId: string; active: boolean }) {
  const t = useT();
  return (
    <ConfirmationDialog
      trigger={
        <Button variant="outline" size="sm">
          {active ? t("Deactivate") : t("Reactivate")}
        </Button>
      }
      title={active ? t("Deactivate this coupon?") : t("Reactivate this coupon?")}
      description={
        active
          ? t("It can no longer be used at checkout. Past redemptions are kept.")
          : t("Customers can use it again within its dates and limits.")
      }
      action={setCouponActiveAction}
      hiddenFields={{ couponId, active: active ? "false" : "true" }}
      confirmLabel={active ? t("Deactivate") : t("Reactivate")}
      successMessage={active ? t("Coupon deactivated") : t("Coupon reactivated")}
      variant={active ? "destructive" : "default"}
    />
  );
}
