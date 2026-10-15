"use client";

import { useT } from "@/i18n/provider";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { revokeEpinAction } from "@/server/services/epin-actions";
import { toast } from "@/components/ui/toast";

/**
 * Revoke is terminal — FRESH/USED -> REVOKED is a one-way transition (see
 * ADR-0015) — so this always uses the destructive confirmation flow, never
 * a bare button.
 */
export function RevokeEpinButton({ epinId, codeLast4 }: { epinId: string; codeLast4: string }) {
  const t = useT();
  return (
    <ConfirmationDialog
      trigger={
        <Button variant="destructive" size="sm">
          <Ban />
          {t("Revoke")}
        </Button>
      }
      title={t("Revoke this e-pin?")}
      description={t(
        "Ending in {last4}. Once revoked, it can never be redeemed or revived. This cannot be undone.",
        { last4: codeLast4 },
      )}
      hiddenFields={{ epinId }}
      confirmLabel={t("Revoke e-pin")}
      variant="destructive"
      action={async (prevState, formData) => {
        const result = await revokeEpinAction(prevState, formData);
        if (result.success) toast.success(t("E-pin revoked"));
        else toast.error(t("Could not revoke e-pin"), result.error.message);
        return result;
      }}
    />
  );
}
