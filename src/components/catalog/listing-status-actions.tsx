"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Ban, Check, Play, RotateCcw, X } from "lucide-react";
import { updateListingStatusAction } from "@/server/services/catalog-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { CatalogKind, ApprovalStatus } from "@/server/domain/catalog/types";
import type { ApiResult } from "@/lib/api-response";

const initialState: ApiResult<null> = { success: true, data: null, meta: { requestId: "" } };

function ActionButton({
  children,
  variant,
}: {
  children: React.ReactNode;
  variant: "default" | "destructive" | "outline";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size="sm" disabled={pending}>
      {children}
    </Button>
  );
}

function SimpleActionForm({
  kind,
  id,
  action,
  label,
  icon,
  variant,
}: {
  kind: CatalogKind;
  id: string;
  action: "approve" | "activate" | "deactivate" | "resubmit";
  label: string;
  icon: React.ReactNode;
  variant: "default" | "outline";
}) {
  const [state, formAction] = useActionState(updateListingStatusAction, initialState);
  return (
    <form action={formAction} className="inline-flex flex-col items-start gap-2">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="action" value={action} />
      <ActionButton variant={variant}>
        {icon}
        {label}
      </ActionButton>
      {state !== initialState && !state.success ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{state.error.message}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}

function RejectDialog({ kind, id }: { kind: CatalogKind; id: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(updateListingStatusAction, initialState);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="destructive">
            <X />
            Reject
          </Button>
        }
      />
      <DialogContent>
        <form action={formAction} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Reject this listing</DialogTitle>
            <DialogDescription>The vendor will see this reason.</DialogDescription>
          </DialogHeader>
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="action" value="reject" />

          {state !== initialState && !state.success ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{state.error.message}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="reason">Reason</Label>
            <Textarea id="reason" name="reason" required rows={3} />
          </div>

          <DialogFooter>
            <ActionButton variant="destructive">Reject</ActionButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Approve/reject (staff, gated by `authorize()` on `*:approve` server-side —
 * a vendor session simply never has the permission, so these buttons are
 * hidden via the `canApprove` prop, not the security boundary) and
 * activate/deactivate/resubmit (owner-or-staff, `*:update`). Shared between
 * admin and vendor detail pages.
 */
export function ListingStatusActions({
  kind,
  id,
  approvalStatus,
  isActive,
  canApprove,
}: {
  kind: CatalogKind;
  id: string;
  approvalStatus: ApprovalStatus;
  isActive: boolean;
  canApprove: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {approvalStatus === "PENDING" && canApprove ? (
        <SimpleActionForm
          kind={kind}
          id={id}
          action="approve"
          label="Approve"
          icon={<Check />}
          variant="default"
        />
      ) : null}
      {approvalStatus === "PENDING" && canApprove ? <RejectDialog kind={kind} id={id} /> : null}
      {approvalStatus === "REJECTED" ? (
        <SimpleActionForm
          kind={kind}
          id={id}
          action="resubmit"
          label="Resubmit for review"
          icon={<RotateCcw />}
          variant="outline"
        />
      ) : null}
      {approvalStatus === "APPROVED" && isActive ? (
        <SimpleActionForm
          kind={kind}
          id={id}
          action="deactivate"
          label="Deactivate"
          icon={<Ban />}
          variant="outline"
        />
      ) : null}
      {approvalStatus === "APPROVED" && !isActive ? (
        <SimpleActionForm
          kind={kind}
          id={id}
          action="activate"
          label="Activate"
          icon={<Play />}
          variant="default"
        />
      ) : null}
    </div>
  );
}
