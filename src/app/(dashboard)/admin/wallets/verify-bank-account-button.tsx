"use client";

import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { toast } from "@/components/ui/toast";
import { verifyBankAccountAction } from "@/server/services/wallet-actions";
import type { ApiResult } from "@/lib/api-response";

/** Marks a member's bank account verified — the KYC gate payout eligibility checks. */
export function VerifyBankAccountButton({ bankAccountId }: { bankAccountId: string }) {
  const router = useRouter();

  async function handleAction(prevState: unknown, formData: FormData): Promise<ApiResult<null>> {
    const result = await verifyBankAccountAction(prevState, formData);
    if (result.success) {
      toast.success("Bank account verified", "This member can now request a payout.");
      router.refresh();
    }
    return result;
  }

  return (
    <ConfirmationDialog
      trigger={
        <Button size="sm" variant="outline">
          <ShieldCheck />
          Verify
        </Button>
      }
      title="Verify this bank account?"
      description="Confirm only after you've checked the account details are genuine (e.g. a cancelled cheque or penny-drop check). Verified accounts become eligible for payouts."
      hiddenFields={{ bankAccountId }}
      confirmLabel="Verify account"
      action={handleAction}
    />
  );
}
