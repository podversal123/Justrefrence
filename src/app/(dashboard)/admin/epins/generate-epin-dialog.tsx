"use client";

import { useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { AlertCircle, Check, Copy, Plus, TriangleAlert } from "lucide-react";
import { generateEpinAction } from "@/server/services/epin-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export interface GenerateEpinPlanOption {
  id: string;
  code: string;
  type: string;
}

const initialState: ApiResult<{ rawCode: string; codeLast4: string }> = {
  success: true,
  data: null as unknown as { rawCode: string; codeLast4: string },
  meta: { requestId: "" },
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Generating…" : "Generate e-pin"}
    </Button>
  );
}

/** Groups a 16-char code into 4-char blocks for readability: "ABCD EFGH JKLM NPQR". */
function formatCodeForDisplay(code: string): string {
  return code.replace(/(.{4})(?=.)/g, "$1 ");
}

/**
 * The one-time code-reveal flow for e-pin generation (ADR-0015): the raw
 * code is returned from the server action exactly once and is never
 * recoverable again (HMAC-hashed at rest). This dialog cannot be dismissed
 * via backdrop click, Escape, or the usual X once a code has been revealed
 * — only the explicit "I've copied it, close" button closes it, so an
 * admin can't accidentally navigate away without having seen the code.
 */
export function GenerateEpinDialog({ plans }: { plans: GenerateEpinPlanOption[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(generateEpinAction, initialState);
  const [revealed, setRevealed] = useState<{ rawCode: string; codeLast4: string } | null>(null);
  const [copied, setCopied] = useState(false);
  // Adjusting state during render in response to a prop/state change, per
  // https://react.dev/learn/you-might-not-need-an-effect — avoids the extra
  // render pass (and the lint warning) an effect-based setState would cause.
  const [handledRequestId, setHandledRequestId] = useState(state.meta.requestId);
  if (state.meta.requestId !== handledRequestId) {
    setHandledRequestId(state.meta.requestId);
    if (state.success && state.data) {
      setRevealed(state.data);
      setCopied(false);
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next && revealed) return; // block silent close while a code is on screen
    setOpen(next);
  }

  function handleConfirmClose() {
    setRevealed(null);
    setCopied(false);
    setOpen(false);
  }

  async function handleCopy() {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed.rawCode);
      setCopied(true);
    } catch {
      // Clipboard API can be unavailable (insecure context, permissions) —
      // the code is still shown on screen, so this is a soft failure.
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button>
            <Plus />
            Generate e-pin
          </Button>
        }
      />
      <DialogContent showCloseButton={!revealed}>
        {revealed ? (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>E-pin generated</DialogTitle>
              <DialogDescription>
                Copy this code now — it cannot be shown again.
              </DialogDescription>
            </DialogHeader>

            <div className="bg-surface-sunken flex flex-col items-center gap-2 rounded-lg p-4">
              <p className="font-mono text-lg font-semibold tracking-widest">
                {formatCodeForDisplay(revealed.rawCode)}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
                {copied ? <Check /> : <Copy />}
                {copied ? "Copied" : "Copy code"}
              </Button>
            </div>

            <Alert variant="warning">
              <TriangleAlert className="size-4" />
              <AlertDescription>
                This is the only time this code will be shown. Store it securely and hand it off
                now — Justreference cannot retrieve or redisplay it later.
              </AlertDescription>
            </Alert>

            <DialogFooter>
              <Button type="button" onClick={handleConfirmClose}>
                I&apos;ve copied it, close
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form action={formAction} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>Generate e-pin</DialogTitle>
              <DialogDescription>
                Creates a single-use prepaid code for a subscription plan. The code is shown once,
                immediately after generation.
              </DialogDescription>
            </DialogHeader>

            {state !== initialState && !state.success ? (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertDescription>{state.error.message}</AlertDescription>
              </Alert>
            ) : null}

            {plans.length === 0 ? (
              <Alert variant="warning">
                <TriangleAlert className="size-4" />
                <AlertDescription>
                  No active subscription plans exist yet. Create one first at{" "}
                  <Link href="/admin/subscription-plans">Subscription plans</Link> before
                  generating an e-pin.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="epin-planId">Plan</Label>
                  <Select name="planId" required>
                    <SelectTrigger id="epin-planId" className="w-full">
                      <SelectValue placeholder="Select a plan" />
                    </SelectTrigger>
                    <SelectContent>
                      {plans.map((plan) => (
                        <SelectItem key={plan.id} value={plan.id}>
                          {plan.code} ({plan.type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="epin-expiresInDays">Expiry (days, optional)</Label>
                  <Input
                    id="epin-expiresInDays"
                    name="expiresInDays"
                    type="number"
                    min={1}
                    placeholder="Leave blank for no expiry"
                  />
                </div>
              </>
            )}

            <DialogFooter>{plans.length > 0 ? <SubmitButton /> : null}</DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
