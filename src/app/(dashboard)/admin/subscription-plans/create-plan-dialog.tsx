"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Plus } from "lucide-react";
import { createSubscriptionPlanAction } from "@/server/services/subscription-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

const initialState: ApiResult<{ planId: string }> = {
  success: true,
  data: null as unknown as { planId: string },
  meta: { requestId: "" },
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creating…" : "Create plan"}
    </Button>
  );
}

export function CreatePlanDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(createSubscriptionPlanAction, initialState);
  const [type, setType] = useState("YEARLY");
  const isLifetime = type === "LIFETIME";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setType("YEARLY");
      }}
    >
      <DialogTrigger
        render={
          <Button>
            <Plus />
            Create plan
          </Button>
        }
      />
      <DialogContent>
        <form action={formAction} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Create a subscription plan</DialogTitle>
            <DialogDescription>
              Pricing and duration are fully configurable here — nothing is hardcoded elsewhere.
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
              <Label htmlFor="plan-code">Code</Label>
              <Input id="plan-code" name="code" placeholder="YEARLY-PRO" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-type">Type</Label>
              <Select name="type" value={type} onValueChange={(value) => setType(value ?? "YEARLY")} required>
                <SelectTrigger id="plan-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="YEARLY">Yearly</SelectItem>
                  <SelectItem value="TIME_BOUND">Time-bound</SelectItem>
                  <SelectItem value="LIFETIME">Lifetime</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="plan-priceRupees">Price (₹)</Label>
              <Input
                id="plan-priceRupees"
                name="priceRupees"
                type="number"
                step="0.01"
                min={0.01}
                placeholder="999"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-durationDays">Duration (days)</Label>
              <Input
                id="plan-durationDays"
                name="durationDays"
                type="number"
                min={1}
                placeholder={isLifetime ? "No expiry" : "365"}
                disabled={isLifetime}
                required={!isLifetime}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="plan-benefits">Benefits (optional)</Label>
            <Textarea
              id="plan-benefits"
              name="benefits"
              placeholder="Describe what this plan includes…"
              rows={3}
            />
          </div>

          <DialogFooter>
            <SubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
