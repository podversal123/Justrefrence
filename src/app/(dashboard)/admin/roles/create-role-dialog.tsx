"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Plus } from "lucide-react";
import { createRoleAction } from "@/server/services/role-actions";
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
import { PERMISSIONS } from "@/server/auth/permissions";
import type { ApiResult } from "@/lib/api-response";

const initialState: ApiResult<{ roleId: string }> = {
  success: true,
  data: null as unknown as { roleId: string },
  meta: { requestId: "" },
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creating…" : "Create role"}
    </Button>
  );
}

export function CreateRoleDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(createRoleAction, initialState);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(code: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <Plus />
            Create role
          </Button>
        }
      />
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <form action={formAction} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Create a custom role</DialogTitle>
            <DialogDescription>
              Composed only from existing permissions — see docs/adr/0010.
            </DialogDescription>
          </DialogHeader>

          {state !== initialState && !state.success ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{state.error.message}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="role-code">Code</Label>
              <Input id="role-code" name="code" placeholder="CATALOG_MANAGER" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-label">Label</Label>
              <Input id="role-label" name="label" placeholder="Catalog Manager" required />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Permissions</Label>
            <div className="grid max-h-64 grid-cols-1 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
              {PERMISSIONS.map((code) => (
                <label key={code} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm">
                  <input
                    type="checkbox"
                    name="permissionCodes"
                    value={code}
                    checked={selected.has(code)}
                    onChange={() => toggle(code)}
                    className="accent-primary"
                  />
                  <span className="font-mono text-xs">{code}</span>
                </label>
              ))}
            </div>
          </div>

          <DialogFooter>
            <SubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
