"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Ban, Check, X } from "lucide-react";
import { updateVendorStatusAction } from "@/server/services/vendor-actions";
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
    <Button type="submit" variant={variant} disabled={pending} size="sm">
      {children}
    </Button>
  );
}

function SimpleStatusForm({
  vendorProfileId,
  status,
  label,
  icon,
  variant,
}: {
  vendorProfileId: string;
  status: "APPROVED" | "SUSPENDED";
  label: string;
  icon: React.ReactNode;
  variant: "default" | "outline";
}) {
  const [state, formAction] = useActionState(updateVendorStatusAction, initialState);

  return (
    <form action={formAction} className="inline-flex flex-col items-start gap-2">
      <input type="hidden" name="vendorProfileId" value={vendorProfileId} />
      <input type="hidden" name="status" value={status} />
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

function RejectDialog({ vendorProfileId }: { vendorProfileId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(updateVendorStatusAction, initialState);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="destructive">
            <X /> Reject
          </Button>
        }
      />
      <DialogContent>
        <form action={formAction} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Reject this vendor</DialogTitle>
            <DialogDescription>The vendor will see this reason on their profile.</DialogDescription>
          </DialogHeader>
          <input type="hidden" name="vendorProfileId" value={vendorProfileId} />
          <input type="hidden" name="status" value="REJECTED" />

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
            <ActionButton variant="destructive">Reject vendor</ActionButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function VendorStatusActions({
  vendorProfileId,
  status,
  canApprove,
  canReject,
  canSuspend,
}: {
  vendorProfileId: string;
  status: string;
  canApprove: boolean;
  canReject: boolean;
  canSuspend: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {status === "PENDING" && canApprove ? (
        <SimpleStatusForm
          vendorProfileId={vendorProfileId}
          status="APPROVED"
          label="Approve"
          icon={<Check />}
          variant="default"
        />
      ) : null}
      {status === "PENDING" && canReject ? (
        <RejectDialog vendorProfileId={vendorProfileId} />
      ) : null}
      {(status === "REJECTED" || status === "SUSPENDED") && canApprove ? (
        <SimpleStatusForm
          vendorProfileId={vendorProfileId}
          status="APPROVED"
          label="Re-approve"
          icon={<Check />}
          variant="default"
        />
      ) : null}
      {status === "APPROVED" && canSuspend ? (
        <SimpleStatusForm
          vendorProfileId={vendorProfileId}
          status="SUSPENDED"
          label="Suspend"
          icon={<Ban />}
          variant="outline"
        />
      ) : null}
    </div>
  );
}
