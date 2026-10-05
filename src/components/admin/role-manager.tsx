"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Plus, X } from "lucide-react";
import { assignRoleAction, removeRoleAction } from "@/server/services/role-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ApiResult } from "@/lib/api-response";

interface Grant {
  id: string;
  role: { id: string; code: string; label: string };
}

const nullResult: ApiResult<null> = { success: true, data: null, meta: { requestId: "" } };

// useFormStatus only sees the nearest ANCESTOR <form> — it must be called
// from a component nested inside the form's JSX, not the component that
// renders the <form> itself. These two tiny components exist for that reason.
function RemoveSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label="Remove role"
      className="hover:text-destructive ml-1 inline-flex align-middle disabled:opacity-50"
    >
      <X className="size-3" />
    </button>
  );
}

function RemoveButton({ userRoleId }: { userRoleId: string }) {
  const [state, formAction] = useActionState(removeRoleAction, nullResult);

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="userRoleId" value={userRoleId} />
      <RemoveSubmitButton />
      {state !== nullResult && !state.success ? (
        <span className="text-destructive ml-2 text-xs">{state.error.message}</span>
      ) : null}
    </form>
  );
}

function AssignSubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="outline" disabled={disabled || pending}>
      <Plus />
      Assign
    </Button>
  );
}

function AssignForm({
  userId,
  assignableRoles,
}: {
  userId: string;
  assignableRoles: Grant["role"][];
}) {
  const [state, formAction] = useActionState(assignRoleAction, nullResult);
  const [roleId, setRoleId] = useState("");

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="roleId" value={roleId} />
      <Select value={roleId} onValueChange={(value) => setRoleId(value ?? "")}>
        <SelectTrigger className="w-48" aria-label="Choose a role to add">
          <SelectValue placeholder="Add a role…" />
        </SelectTrigger>
        <SelectContent>
          {assignableRoles.map((role) => (
            <SelectItem key={role.id} value={role.id}>
              {role.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <AssignSubmitButton disabled={!roleId} />
      {state !== nullResult && !state.success ? (
        <Alert variant="destructive" className="w-full">
          <AlertCircle className="size-4" />
          <AlertDescription>{state.error.message}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}

/**
 * "Assign role" / "Remove role" from the Phase 2 brief — reused by both the
 * admin detail and vendor detail pages. Server-side authorization happens
 * inside assignRoleAction/removeRoleAction (role:assign); this component
 * renders optimistically-disabled controls but is never the source of truth
 * for whether the action is allowed.
 */
export function RoleManager({
  userId,
  currentGrants,
  allRoles,
}: {
  userId: string;
  currentGrants: Grant[];
  allRoles: Grant["role"][];
}) {
  const heldRoleIds = new Set(currentGrants.map((g) => g.role.id));
  const assignableRoles = allRoles.filter((r) => !heldRoleIds.has(r.id));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {currentGrants.length === 0 ? (
          <p className="text-muted-foreground text-sm">No roles assigned.</p>
        ) : (
          currentGrants.map((grant) => (
            <Badge key={grant.id} variant="secondary" className="gap-0">
              {grant.role.label}
              <RemoveButton userRoleId={grant.id} />
            </Badge>
          ))
        )}
      </div>
      {assignableRoles.length > 0 ? (
        <AssignForm userId={userId} assignableRoles={assignableRoles} />
      ) : null}
    </div>
  );
}
