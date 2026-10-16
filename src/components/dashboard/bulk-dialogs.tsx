"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Check, X } from "lucide-react";
import { useT } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * The "approve selected" and "reject selected" confirmations shared by the queues that act on many rows
 * at once (pending approvals, payouts). The wording differs per queue, so the caller passes the
 * already-translated title and description; everything else is the same.
 */

export function BulkApproveAction({
  title,
  description,
  onConfirm,
}: {
  title: string;
  description: string;
  onConfirm: () => Promise<void>;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    await onConfirm();
    setBusy(false);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm">
            <Check />
            {t("Approve selected")}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            {t("Cancel")}
          </Button>
          <Button onClick={handleConfirm} disabled={busy}>
            {busy ? t("Approving…") : t("Approve all")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BulkRejectAction({
  title,
  description,
  onConfirm,
}: {
  title: string;
  description: string;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    await onConfirm(reason);
    setBusy(false);
    setOpen(false);
    setReason("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="destructive">
            <X />
            {t("Reject selected")}
          </Button>
        }
      />
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="bulk-reject-reason">{t("Reason")}</Label>
            <Textarea
              id="bulk-reject-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              {t("Cancel")}
            </Button>
            <Button type="submit" variant="destructive" disabled={busy}>
              {busy ? t("Rejecting…") : t("Reject all")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
