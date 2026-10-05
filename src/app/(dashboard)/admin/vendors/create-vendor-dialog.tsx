"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Plus } from "lucide-react";
import { createVendorAction } from "@/server/services/vendor-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const initialState: ApiResult<{ userId: string }> = {
  success: true,
  data: null as unknown as { userId: string },
  meta: { requestId: "" },
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Sending invite…" : "Create vendor"}
    </Button>
  );
}

export function CreateVendorDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(createVendorAction, initialState);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <Plus />
            Create vendor
          </Button>
        }
      />
      <DialogContent>
        <form action={formAction} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Create vendor account</DialogTitle>
            <DialogDescription>
              Sends an email invite. The vendor starts as <strong>Pending</strong> until you approve
              them.
            </DialogDescription>
          </DialogHeader>

          {state !== initialState && !state.success ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{state.error.message}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="vendor-businessName">Business name</Label>
            <Input id="vendor-businessName" name="businessName" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="vendor-fullName">Contact name</Label>
            <Input id="vendor-fullName" name="fullName" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="vendor-email">Contact email</Label>
            <Input id="vendor-email" name="email" type="email" required />
          </div>

          <DialogFooter>
            <SubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
