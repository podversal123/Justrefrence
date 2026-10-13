"use client";

import { useState } from "react";
import { useActionState } from "@/lib/use-action-state";
import { useFormStatus } from "react-dom";
import { AlertCircle, Plus } from "lucide-react";
import { createAdminAction } from "@/server/services/admin-actions";
import { FormGrid } from "@/components/ui/form-grid";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
      {pending ? "Sending invite…" : "Create admin"}
    </Button>
  );
}

export function CreateAdminDialog({
  roles,
}: {
  roles: { id: string; code: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(createAdminAction, initialState);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
      }}
    >
      <DialogTrigger
        render={
          <Button>
            <Plus />
            Create admin
          </Button>
        }
      />
      <DialogContent className="sm:max-w-xl">
        <form action={formAction} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Create admin account</DialogTitle>
            <DialogDescription>
              Sends an email invite so they can set their own password.
            </DialogDescription>
          </DialogHeader>

          {state !== initialState && !state.success ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{state.error.message}</AlertDescription>
            </Alert>
          ) : null}

          <FormGrid>
            <div className="space-y-2">
              <Label htmlFor="admin-fullName">Full name</Label>
              <Input id="admin-fullName" name="fullName" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="admin-email">Email</Label>
              <Input id="admin-email" name="email" type="email" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="admin-phone">Mobile (optional)</Label>
              <Input id="admin-phone" name="phone" type="tel" placeholder="+919876543210" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="admin-roleId">Role</Label>
              <Select name="roleId" required>
                <SelectTrigger id="admin-roleId" className="w-full">
                  <SelectValue placeholder="Choose a role" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </FormGrid>

          <DialogFooter>
            <SubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
