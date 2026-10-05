"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Banknote, Check, Eye, PiggyBank, X } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { EmptyState } from "@/components/ui/empty-state";
import { BulkActionToolbar } from "@/components/dashboard/bulk-action-toolbar";
import { DetailDrawer } from "@/components/dashboard/detail-drawer";
import { toast } from "@/components/ui/toast";
import { updatePayoutStatusAction } from "@/server/services/wallet-actions";
import { formatPaise } from "@/lib/money";
import type { PayoutStatus } from "@/generated/prisma/enums";
import type { ApiResult } from "@/lib/api-response";

/**
 * Client-safe shape for a payout queue row — built server-side in page.tsx
 * from listAllPayoutRequests() + getPayoutRequestById() (for the detail
 * drawer's transaction fields). Every bigint is already a string and every
 * relation is already picked down to display fields — see money.ts's
 * "amounts are strings at this boundary" comment for why.
 */
export interface PayoutDetailRow {
  id: string;
  amount: string;
  status: PayoutStatus;
  createdAt: Date;
  rejectedReason: string | null;
  requester: { email: string; fullName: string | null };
  bankAccount: {
    accountHolderName: string;
    accountNoMasked: string;
    ifsc: string;
    branchAddress: string | null;
  };
  transaction: {
    transferReference: string | null;
    tdsDeducted: string;
    netAmount: string;
    paidAt: Date | null;
  } | null;
}

function errorMessage(result: ApiResult<null>): string {
  return result.success ? "" : result.error.message;
}

/**
 * Builds the FormData updatePayoutStatusAction expects and calls it — the
 * ONE real payout-mutation Server Action (src/server/services/wallet-
 * actions.ts, not edited here). Every transition below (approve, reject,
 * advance to processing, mark paid, mark failed) goes through this same
 * action; the state machine it defers to
 * (src/server/domain/wallet/payout-state-machine.ts) is what actually
 * decides whether a given transition is legal for the request's CURRENT
 * status — this file only offers the button for the transition that's
 * valid from each status (REQUESTED -> APPROVED|REJECTED,
 * APPROVED -> PROCESSING, PROCESSING -> PAID|FAILED).
 */
async function transitionPayout(
  payoutRequestId: string,
  status: PayoutStatus,
  extra?: { rejectedReason?: string; transferReference?: string; tdsDeductedRupees?: string },
): Promise<ApiResult<null>> {
  const formData = new FormData();
  formData.set("payoutRequestId", payoutRequestId);
  formData.set("status", status);
  if (extra?.rejectedReason) formData.set("rejectedReason", extra.rejectedReason);
  if (extra?.transferReference) formData.set("transferReference", extra.transferReference);
  if (extra?.tdsDeductedRupees) formData.set("tdsDeductedRupees", extra.tdsDeductedRupees);
  return updatePayoutStatusAction(null, formData);
}

function approveRow(id: string) {
  return transitionPayout(id, "APPROVED");
}
function rejectRow(id: string, reason: string) {
  return transitionPayout(id, "REJECTED", { rejectedReason: reason });
}
function advanceToProcessing(id: string) {
  return transitionPayout(id, "PROCESSING");
}
function markPaidRow(id: string, transferReference: string, tdsDeductedRupees: string) {
  return transitionPayout(id, "PAID", {
    transferReference: transferReference || undefined,
    tdsDeductedRupees: tdsDeductedRupees || undefined,
  });
}
function markFailedRow(id: string) {
  return transitionPayout(id, "FAILED");
}

function RejectDialog({
  busy,
  onReject,
}: {
  busy: boolean;
  onReject: (reason: string) => Promise<ApiResult<null>>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await onReject(reason);
    if (result.success) {
      setOpen(false);
      setReason("");
      setError(null);
    } else {
      setError(errorMessage(result));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger
        render={
          <Button variant="destructive" size="sm" disabled={busy}>
            <X />
            Reject
          </Button>
        }
      />
      <DialogContent>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Reject this payout request?</DialogTitle>
            <DialogDescription>The member will see this reason, and the held funds return to their spendable balance.</DialogDescription>
          </DialogHeader>

          {error ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="payout-reject-reason">Reason</Label>
            <Textarea
              id="payout-reject-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={busy}>
              {busy ? "Working…" : "Reject"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MarkPaidDialog({
  busy,
  onMarkPaid,
}: {
  busy: boolean;
  onMarkPaid: (transferReference: string, tdsDeductedRupees: string) => Promise<ApiResult<null>>;
}) {
  const [open, setOpen] = useState(false);
  const [transferReference, setTransferReference] = useState("");
  const [tdsDeductedRupees, setTdsDeductedRupees] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await onMarkPaid(transferReference, tdsDeductedRupees);
    if (result.success) {
      setOpen(false);
      setTransferReference("");
      setTdsDeductedRupees("");
      setError(null);
    } else {
      setError(errorMessage(result));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm" disabled={busy}>
            <Banknote />
            Mark paid
          </Button>
        }
      />
      <DialogContent>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Mark this payout as paid</DialogTitle>
            <DialogDescription>
              Record the bank transfer you&apos;ve already sent. This releases the held funds for good and
              can&apos;t be undone from here.
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="transfer-reference">Transfer reference (UTR)</Label>
            <Input
              id="transfer-reference"
              value={transferReference}
              onChange={(event) => setTransferReference(event.target.value)}
              placeholder="e.g. a bank UTR number"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tds-deducted">TDS deducted (₹, optional)</Label>
            <Input
              id="tds-deducted"
              type="number"
              min="0"
              step="0.01"
              value={tdsDeductedRupees}
              onChange={(event) => setTdsDeductedRupees(event.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Working…" : "Mark paid"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MarkFailedDialog({
  busy,
  onMarkFailed,
}: {
  busy: boolean;
  onMarkFailed: () => Promise<ApiResult<null>>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    const result = await onMarkFailed();
    if (result.success) {
      setOpen(false);
      setError(null);
    } else {
      setError(errorMessage(result));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm" variant="outline" disabled={busy}>
            <X />
            Mark failed
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark this transfer as failed?</DialogTitle>
          <DialogDescription>
            Use this if the bank transfer bounced or couldn&apos;t be completed. This only marks the request
            FAILED — it does not currently move the held funds back to the member&apos;s spendable balance, so
            follow up on that reconciliation separately.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={busy}>
            {busy ? "Working…" : "Mark failed"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkApproveAction({ count, onConfirm }: { count: number; onConfirm: () => Promise<void> }) {
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
            Approve selected
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Approve {count} payout request{count === 1 ? "" : "s"}?
          </DialogTitle>
          <DialogDescription>Each request is approved individually, the same as approving one at a time.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={busy}>
            {busy ? "Approving…" : "Approve all"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkRejectAction({
  count,
  onConfirm,
}: {
  count: number;
  onConfirm: (reason: string) => Promise<void>;
}) {
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
            Reject selected
          </Button>
        }
      />
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>
              Reject {count} payout request{count === 1 ? "" : "s"}?
            </DialogTitle>
            <DialogDescription>The same reason is applied to every selected request, and each one&apos;s held funds return to the member&apos;s balance.</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="bulk-reject-reason">Reason</Label>
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
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={busy}>
              {busy ? "Rejecting…" : "Reject all"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PayoutRowFooter({
  row,
  busy,
  onApprove,
  onReject,
  onAdvance,
  onMarkPaid,
  onMarkFailed,
}: {
  row: PayoutDetailRow;
  busy: boolean;
  onApprove: () => void;
  onReject: (reason: string) => Promise<ApiResult<null>>;
  onAdvance: () => void;
  onMarkPaid: (transferReference: string, tdsDeductedRupees: string) => Promise<ApiResult<null>>;
  onMarkFailed: () => Promise<ApiResult<null>>;
}) {
  if (row.status === "REQUESTED") {
    return (
      <div className="flex w-full justify-end gap-2">
        <RejectDialog busy={busy} onReject={onReject} />
        <Button size="sm" onClick={onApprove} disabled={busy}>
          <Check />
          {busy ? "Working…" : "Approve"}
        </Button>
      </div>
    );
  }
  if (row.status === "APPROVED") {
    return (
      <div className="flex w-full justify-end gap-2">
        <Button size="sm" onClick={onAdvance} disabled={busy}>
          <ArrowRight />
          {busy ? "Working…" : "Move to processing"}
        </Button>
      </div>
    );
  }
  if (row.status === "PROCESSING") {
    return (
      <div className="flex w-full justify-end gap-2">
        <MarkFailedDialog busy={busy} onMarkFailed={onMarkFailed} />
        <MarkPaidDialog busy={busy} onMarkPaid={onMarkPaid} />
      </div>
    );
  }
  return <p className="text-muted-foreground w-full text-right text-sm">This request is in a final state.</p>;
}

export function PayoutsTable({ items }: { items: PayoutDetailRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Bulk actions only ever apply to REQUESTED rows — the same constraint the
  // real backend state machine enforces per-row (only REQUESTED can go to
  // APPROVED/REJECTED), so only those rows get a selection checkbox.
  const selectableItems = items.filter((row) => row.status === "REQUESTED");
  const selectedRows = selectableItems.filter((row) => selected.has(row.id));
  const allSelected = selectableItems.length > 0 && selected.size === selectableItems.length;
  const someSelected = selected.size > 0 && !allSelected;
  const drawerRow = items.find((row) => row.id === drawerId) ?? null;

  function clearSelection() {
    setSelected(new Set());
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(selectableItems.map((row) => row.id)) : new Set());
  }

  function toggleRow(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function dropFromSelection(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  async function runRowAction(id: string, run: () => Promise<ApiResult<null>>, successMessage: string) {
    setBusyId(id);
    const result = await run();
    setBusyId(null);
    if (result.success) {
      toast.success(successMessage);
      dropFromSelection(id);
      setDrawerId((current) => (current === id ? null : current));
      router.refresh();
    } else {
      toast.error("Could not update payout", result.error.message);
    }
    return result;
  }

  function reportBulkResult(results: ApiResult<null>[], pastTense: string, verbLower: string) {
    const failed = results.filter((result) => !result.success).length;
    const total = results.length;
    if (failed === 0) {
      toast.success(`${pastTense} ${total} request${total === 1 ? "" : "s"}`);
    } else if (failed === total) {
      toast.error(`Bulk ${verbLower} failed`, `None of the selected requests could be ${verbLower}ed.`);
    } else {
      toast.warning(`${pastTense} ${total - failed} of ${total}`, `${failed} failed — open them individually to see why.`);
    }
  }

  async function handleBulkApprove() {
    const rows = selectedRows;
    const results = await Promise.all(rows.map((row) => approveRow(row.id)));
    reportBulkResult(results, "Approved", "approve");
    clearSelection();
    router.refresh();
  }

  async function handleBulkReject(reason: string) {
    const rows = selectedRows;
    const results = await Promise.all(rows.map((row) => rejectRow(row.id, reason)));
    reportBulkResult(results, "Rejected", "reject");
    clearSelection();
    router.refresh();
  }

  return (
    <>
      <BulkActionToolbar
        count={selected.size}
        onClear={clearSelection}
        actions={
          <>
            <BulkApproveAction count={selectedRows.length} onConfirm={handleBulkApprove} />
            <BulkRejectAction count={selectedRows.length} onConfirm={handleBulkReject} />
          </>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          icon={PiggyBank}
          title="No payout requests"
          description="Nothing matches the current filter."
        />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected}
                      indeterminate={someSelected}
                      onCheckedChange={(checked) => toggleAll(checked === true)}
                      aria-label="Select all requested payouts"
                      disabled={selectableItems.length === 0}
                    />
                  </TableHead>
                  <TableHead>Requester</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Bank account</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => {
                  const isSelected = selected.has(row.id);
                  const isBusy = busyId === row.id;
                  return (
                    <TableRow key={row.id} data-state={isSelected ? "selected" : undefined}>
                      <TableCell>
                        {row.status === "REQUESTED" ? (
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => toggleRow(row.id, checked === true)}
                            aria-label={`Select payout request from ${row.requester.fullName ?? row.requester.email}`}
                          />
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <button type="button" className="text-left hover:underline" onClick={() => setDrawerId(row.id)}>
                          <div className="font-medium">{row.requester.fullName ?? row.requester.email}</div>
                          {row.requester.fullName ? (
                            <div className="text-muted-foreground text-xs">{row.requester.email}</div>
                          ) : null}
                        </button>
                      </TableCell>
                      <TableCell className="font-medium">{formatPaise(row.amount)}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {row.bankAccount.accountNoMasked} · {row.bankAccount.ifsc}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">{row.createdAt.toLocaleDateString("en-IN")}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setDrawerId(row.id)} disabled={isBusy}>
                          <Eye />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-3 md:hidden">
            {items.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setDrawerId(row.id)}
                className="hover:bg-muted/40 rounded-lg border p-4 text-left"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{row.requester.fullName ?? row.requester.email}</p>
                    <p className="text-muted-foreground text-sm">{formatPaise(row.amount)}</p>
                  </div>
                  <StatusBadge status={row.status} />
                </div>
                <p className="text-muted-foreground mt-2 text-xs">
                  {row.bankAccount.accountNoMasked} · {row.bankAccount.ifsc}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">Requested {row.createdAt.toLocaleDateString("en-IN")}</p>
              </button>
            ))}
          </div>
        </>
      )}

      <DetailDrawer
        open={drawerRow !== null}
        onOpenChange={(open) => {
          if (!open) setDrawerId(null);
        }}
        title={drawerRow ? drawerRow.requester.fullName ?? drawerRow.requester.email : ""}
        description={drawerRow ? `Payout request · ${formatPaise(drawerRow.amount)}` : undefined}
        footer={
          drawerRow ? (
            <PayoutRowFooter
              row={drawerRow}
              busy={busyId === drawerRow.id}
              onApprove={() => void runRowAction(drawerRow.id, () => approveRow(drawerRow.id), "Payout approved")}
              onReject={(reason) =>
                runRowAction(drawerRow.id, () => rejectRow(drawerRow.id, reason), "Payout rejected")
              }
              onAdvance={() =>
                void runRowAction(drawerRow.id, () => advanceToProcessing(drawerRow.id), "Moved to processing")
              }
              onMarkPaid={(transferReference, tdsDeductedRupees) =>
                runRowAction(
                  drawerRow.id,
                  () => markPaidRow(drawerRow.id, transferReference, tdsDeductedRupees),
                  "Payout marked paid",
                )
              }
              onMarkFailed={() => runRowAction(drawerRow.id, () => markFailedRow(drawerRow.id), "Payout marked failed")}
            />
          ) : null
        }
      >
        {drawerRow ? (
          <dl className="space-y-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Requester</dt>
              <dd className="text-right">
                <div className="font-medium">{drawerRow.requester.fullName ?? "—"}</div>
                <div className="text-muted-foreground text-xs">{drawerRow.requester.email}</div>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Amount requested</dt>
              <dd className="text-right font-medium">{formatPaise(drawerRow.amount)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <StatusBadge status={drawerRow.status} />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Requested</dt>
              <dd>{drawerRow.createdAt.toLocaleDateString("en-IN")}</dd>
            </div>

            <div className="border-border space-y-2 border-t pt-4">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Bank account</p>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Holder</dt>
                <dd>{drawerRow.bankAccount.accountHolderName || "—"}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Account</dt>
                <dd>{drawerRow.bankAccount.accountNoMasked}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">IFSC</dt>
                <dd>{drawerRow.bankAccount.ifsc}</dd>
              </div>
              {drawerRow.bankAccount.branchAddress ? (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Branch</dt>
                  <dd className="text-right">{drawerRow.bankAccount.branchAddress}</dd>
                </div>
              ) : null}
            </div>

            {drawerRow.rejectedReason ? (
              <div className="border-border space-y-1 border-t pt-4">
                <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Rejection reason</p>
                <p>{drawerRow.rejectedReason}</p>
              </div>
            ) : null}

            {drawerRow.transaction ? (
              <div className="border-border space-y-2 border-t pt-4">
                <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Transfer record</p>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Reference</dt>
                  <dd>{drawerRow.transaction.transferReference ?? "—"}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">TDS deducted</dt>
                  <dd>{formatPaise(drawerRow.transaction.tdsDeducted)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Net amount</dt>
                  <dd className="font-medium">{formatPaise(drawerRow.transaction.netAmount)}</dd>
                </div>
                {drawerRow.transaction.paidAt ? (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">Paid</dt>
                    <dd>{drawerRow.transaction.paidAt.toLocaleDateString("en-IN")}</dd>
                  </div>
                ) : null}
              </div>
            ) : null}
          </dl>
        ) : null}
      </DetailDrawer>
    </>
  );
}
