"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { updateRolePermissionsAction } from "@/server/services/role-actions";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PERMISSIONS } from "@/server/auth/permissions";
import type { ApiResult } from "@/lib/api-response";

const initialState: ApiResult<null> = { success: true, data: null, meta: { requestId: "" } };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save permissions"}
    </Button>
  );
}

export function RolePermissionEditor({
  roleId,
  currentPermissionCodes,
  readOnly,
}: {
  roleId: string;
  currentPermissionCodes: string[];
  readOnly: boolean;
}) {
  const [state, formAction] = useActionState(updateRolePermissionsAction, initialState);
  const [selected, setSelected] = useState<Set<string>>(new Set(currentPermissionCodes));
  const submitted = state !== initialState;

  function toggle(code: string) {
    if (readOnly) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="roleId" value={roleId} />

      {submitted && !state.success ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{state.error.message}</AlertDescription>
        </Alert>
      ) : null}
      {submitted && state.success ? (
        <Alert>
          <CheckCircle2 className="size-4" />
          <AlertDescription>Permissions updated.</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid max-h-96 grid-cols-1 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
        {PERMISSIONS.map((code) => (
          <label
            key={code}
            className="hover:bg-muted/50 flex items-center gap-2 rounded px-1.5 py-1 text-sm"
          >
            <input
              type="checkbox"
              name="permissionCodes"
              value={code}
              checked={selected.has(code)}
              onChange={() => toggle(code)}
              disabled={readOnly}
              className="accent-primary"
            />
            <span className="font-mono text-xs">{code}</span>
          </label>
        ))}
      </div>

      {!readOnly ? <SubmitButton /> : null}
    </form>
  );
}
