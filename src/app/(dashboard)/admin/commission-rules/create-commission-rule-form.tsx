"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { createCommissionRuleAction } from "@/server/services/commission-actions";
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
import type { ApiResult } from "@/lib/api-response";

const initialState: ApiResult<{ ruleId: string }> = {
  success: true,
  data: { ruleId: "" },
  meta: { requestId: "" },
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Activate rule"}
    </Button>
  );
}

export function CreateCommissionRuleForm() {
  const [state, formAction] = useActionState(createCommissionRuleAction, initialState);
  const [rateBasis, setRateBasis] = useState("PERCENT_OF_ORDER");
  const submitted = state !== initialState;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {submitted && !state.success ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{state.error.message}</AlertDescription>
        </Alert>
      ) : null}
      {submitted && state.success ? (
        <Alert>
          <CheckCircle2 className="size-4" />
          <AlertDescription>Commission rule activated.</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="level">Referral level</Label>
          <Input id="level" name="level" type="number" min={1} max={20} defaultValue={1} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="appliesTo">Applies to</Label>
          <Select name="appliesTo" defaultValue="PRODUCT" required>
            <SelectTrigger id="appliesTo" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PRODUCT">Product</SelectItem>
              <SelectItem value="SERVICE">Service</SelectItem>
              <SelectItem value="PROJECT">Project</SelectItem>
              <SelectItem value="EPIN">E-pin</SelectItem>
              <SelectItem value="SUBSCRIPTION">Subscription</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="rateBasis">Rate basis</Label>
        <Select
          name="rateBasis"
          value={rateBasis}
          onValueChange={(value) => setRateBasis(value ?? "PERCENT_OF_ORDER")}
          required
        >
          <SelectTrigger id="rateBasis" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="PERCENT_OF_ORDER">Percent of order</SelectItem>
            <SelectItem value="PERCENT_OF_VENDOR_SALE">Percent of vendor sale</SelectItem>
            <SelectItem value="PERCENT_OF_PLATFORM_FEE">Percent of platform fee</SelectItem>
            <SelectItem value="FIXED">Fixed amount</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {rateBasis === "FIXED" ? (
        <div className="space-y-2">
          <Label htmlFor="rateValueFixed">Fixed amount (paise)</Label>
          <Input id="rateValueFixed" name="rateValueFixed" inputMode="numeric" placeholder="5000" required />
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="rateValuePercent">Rate (%)</Label>
          <Input
            id="rateValuePercent"
            name="rateValuePercent"
            type="number"
            step="0.01"
            min={0}
            max={100}
            placeholder="5"
            required
          />
        </div>
      )}

      <input type="hidden" name="qualifyingEvent" value="ORDER_COMPLETED" />

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="releaseDelayDays">Release delay (days)</Label>
          <Input id="releaseDelayDays" name="releaseDelayDays" type="number" min={0} max={365} defaultValue={7} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="minimumActivityCount">Minimum activity (optional)</Label>
          <Input id="minimumActivityCount" name="minimumActivityCount" type="number" min={0} placeholder="0" />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="requiresActiveSubscription" className="size-4" />
        Requires an active subscription to earn
      </label>

      <SubmitButton />
    </form>
  );
}
