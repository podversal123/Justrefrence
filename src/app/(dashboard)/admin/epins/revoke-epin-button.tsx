"use client";

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
  return (
    <ConfirmationDialog
      trigger={
        <Button variant="destructive" size="sm">
          <Ban />
          Revoke
        </Button>
      }
      title="Revoke this e-pin?"
      description={`Ending in ${codeLast4}. Once revoked, it can never be redeemed or revived — this cannot be undone.`}
      hiddenFields={{ epinId }}
      confirmLabel="Revoke e-pin"
      variant="destructive"
      action={async (prevState, formData) => {
        const result = await revokeEpinAction(prevState, formData);
        if (result.success) toast.success("E-pin revoked");
        else toast.error("Could not revoke e-pin", result.error.message);
        return result;
      }}
    />
  );
}
