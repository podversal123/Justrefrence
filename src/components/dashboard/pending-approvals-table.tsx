"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { AlertCircle, Check, ClipboardCheck, Eye, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { BulkActionToolbar } from "@/components/dashboard/bulk-action-toolbar";
import { DetailDrawer } from "@/components/dashboard/detail-drawer";
import { toast } from "@/components/ui/toast";
import { updateVendorStatusAction } from "@/server/services/vendor-actions";
import { updateListingStatusAction } from "@/server/services/catalog-actions";
import { CATALOG_ROUTE_SEGMENTS, type CatalogKind } from "@/server/domain/catalog/types";
import type { PendingApprovalRow } from "@/server/repositories/dashboard/dashboard-repository";
import type { ApiResult } from "@/lib/api-response";

function approvalHref(row: PendingApprovalRow): Route {
  if (row.kind === "VENDOR") return `/admin/vendors/${row.id}` as Route;
  const segment = CATALOG_ROUTE_SEGMENTS[row.kind as CatalogKind];
  return `/admin/catalog/${segment}/${row.id}` as Route;
}

function rowKey(row: PendingApprovalRow): string {
  return `${row.kind}-${row.id}`;
}

function errorMessage(result: ApiResult<null>): string {
  return result.success ? "" : result.error.message;
}

/**
 * Both of these call the EXISTING single-row approve/reject Server Actions
 * (src/server/services/vendor-actions.ts#updateVendorStatusAction and
 * src/server/services/catalog-actions.ts#updateListingStatusAction) — no
 * new bulk-mutation action was written. Bulk operations below just invoke
 * one of these per selected row.
 */
async function approveRow(row: PendingApprovalRow): Promise<ApiResult<null>> {
  const formData = new FormData();
  if (row.kind === "VENDOR") {
    formData.set("vendorProfileId", row.id);
    formData.set("status", "APPROVED");
    return updateVendorStatusAction(null, formData);
  }
  formData.set("kind", row.kind);
  formData.set("id", row.id);
  formData.set("action", "approve");
  return updateListingStatusAction(null, formData);
}

async function rejectRow(row: PendingApprovalRow, reason: string): Promise<ApiResult<null>> {
  const formData = new FormData();
  if (row.kind === "VENDOR") {
    formData.set("vendorProfileId", row.id);
    formData.set("status", "REJECTED");
    formData.set("reason", reason);
    return updateVendorStatusAction(null, formData);
  }
  formData.set("kind", row.kind);
  formData.set("id", row.id);
  formData.set("action", "reject");
  formData.set("reason", reason);
  return updateListingStatusAction(null, formData);
}

/**
 * The approve/reject controls reproduced in the detail drawer's footer —
 * same UX as the real per-row controls elsewhere in the app (vendor-status-
 * actions.tsx / listing-status-actions.tsx): Approve is a single direct
 * action, Reject opens a dialog that requires a reason.
 */
function RowApprovalFooter({
  row,
  busy,
  onApprove,
  onReject,
}: {
  row: PendingApprovalRow;
  busy: boolean;
  onApprove: () => void;
  onReject: (reason: string) => Promise<ApiResult<null>>;
}) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submitReject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await onReject(reason);
    if (result.success) {
      setRejectOpen(false);
      setReason("");
      setError(null);
    } else {
      setError(errorMessage(result));
    }
  }

  return (
    <div className="flex w-full justify-end gap-2">
      <Dialog
        open={rejectOpen}
        onOpenChange={(open) => {
          setRejectOpen(open);
          if (!open) setError(null);
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
          <form onSubmit={submitReject} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>Reject &ldquo;{row.title}&rdquo;?</DialogTitle>
              <DialogDescription>
                {row.kind === "VENDOR"
                  ? "The vendor will see this reason on their profile."
                  : "The vendor will see this reason."}
              </DialogDescription>
            </DialogHeader>

            {error ? (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="drawer-reject-reason">Reason</Label>
              <Textarea
                id="drawer-reject-reason"
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

      <Button size="sm" onClick={onApprove} disabled={busy}>
        <Check />
        {busy ? "Working…" : "Approve"}
      </Button>
    </div>
  );
}

function BulkApproveAction({
  rows,
  onConfirm,
}: {
  rows: PendingApprovalRow[];
  onConfirm: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const count = rows.length;

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
            Approve {count} item{count === 1 ? "" : "s"}?
          </DialogTitle>
          <DialogDescription>
            Each vendor or listing is approved individually, the same as approving one at a time.
          </DialogDescription>
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
  rows,
  onConfirm,
}: {
  rows: PendingApprovalRow[];
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const count = rows.length;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
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
              Reject {count} item{count === 1 ? "" : "s"}?
            </DialogTitle>
            <DialogDescription>The same reason is applied to every selected vendor or listing.</DialogDescription>
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

export function PendingApprovalsTable({ items }: { items: PendingApprovalRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerRow, setDrawerRow] = useState<PendingApprovalRow | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const selectedRows = items.filter((row) => selected.has(rowKey(row)));
  const allSelected = items.length > 0 && selected.size === items.length;
  const someSelected = selected.size > 0 && !allSelected;

  function clearSelection() {
    setSelected(new Set());
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(items.map(rowKey)) : new Set());
  }

  function toggleRow(key: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function dropFromSelection(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  async function handleRowApprove(row: PendingApprovalRow) {
    const key = rowKey(row);
    setBusyKey(key);
    const result = await approveRow(row);
    setBusyKey(null);
    if (result.success) {
      toast.success(`"${row.title}" approved`);
      dropFromSelection(key);
      setDrawerRow((current) => (current && rowKey(current) === key ? null : current));
      router.refresh();
    } else {
      toast.error("Could not approve", result.error.message);
    }
  }

  async function handleRowReject(row: PendingApprovalRow, reason: string): Promise<ApiResult<null>> {
    const key = rowKey(row);
    setBusyKey(key);
    const result = await rejectRow(row, reason);
    setBusyKey(null);
    if (result.success) {
      toast.success(`"${row.title}" rejected`);
      dropFromSelection(key);
      setDrawerRow((current) => (current && rowKey(current) === key ? null : current));
      router.refresh();
    } else {
      toast.error("Could not reject", result.error.message);
    }
    return result;
  }

  async function handleBulkApprove() {
    const rows = selectedRows;
    const results = await Promise.all(rows.map((row) => approveRow(row)));
    const failed = results.filter((result) => !result.success).length;
    if (failed === 0) {
      toast.success(`Approved ${rows.length} item${rows.length === 1 ? "" : "s"}`);
    } else if (failed === rows.length) {
      toast.error("Bulk approve failed", "None of the selected items could be approved.");
    } else {
      toast.warning(
        `Approved ${rows.length - failed} of ${rows.length}`,
        `${failed} failed — open them individually to see why.`,
      );
    }
    clearSelection();
    router.refresh();
  }

  async function handleBulkReject(reason: string) {
    const rows = selectedRows;
    const results = await Promise.all(rows.map((row) => rejectRow(row, reason)));
    const failed = results.filter((result) => !result.success).length;
    if (failed === 0) {
      toast.success(`Rejected ${rows.length} item${rows.length === 1 ? "" : "s"}`);
    } else if (failed === rows.length) {
      toast.error("Bulk reject failed", "None of the selected items could be rejected.");
    } else {
      toast.warning(
        `Rejected ${rows.length - failed} of ${rows.length}`,
        `${failed} failed — open them individually to see why.`,
      );
    }
    clearSelection();
    router.refresh();
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pending approvals</CardTitle>
          <CardDescription>Vendor applications and new listings awaiting review.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <BulkActionToolbar
            count={selected.size}
            onClear={clearSelection}
            actions={
              <>
                <BulkApproveAction rows={selectedRows} onConfirm={handleBulkApprove} />
                <BulkRejectAction rows={selectedRows} onConfirm={handleBulkReject} />
              </>
            }
          />

          {items.length === 0 ? (
            <EmptyState icon={ClipboardCheck} title="All caught up" description="Nothing is waiting for review." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected}
                      indeterminate={someSelected}
                      onCheckedChange={(checked) => toggleAll(checked === true)}
                      aria-label="Select all pending approvals"
                    />
                  </TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => {
                  const key = rowKey(row);
                  const isSelected = selected.has(key);
                  const isBusy = busyKey === key;
                  return (
                    <TableRow key={key} data-state={isSelected ? "selected" : undefined}>
                      <TableCell>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) => toggleRow(key, checked === true)}
                          aria-label={`Select ${row.title}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{row.kind}</Badge>
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          className="hover:underline text-left"
                          onClick={() => setDrawerRow(row)}
                        >
                          {row.title}
                        </button>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status="PENDING" />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {row.submittedAt.toLocaleDateString("en-IN")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setDrawerRow(row)} disabled={isBusy}>
                          <Eye />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <DetailDrawer
        open={drawerRow !== null}
        onOpenChange={(open) => {
          if (!open) setDrawerRow(null);
        }}
        title={drawerRow?.title ?? ""}
        description={drawerRow ? `${drawerRow.kind} · awaiting review` : undefined}
        footer={
          drawerRow ? (
            <RowApprovalFooter
              row={drawerRow}
              busy={busyKey === rowKey(drawerRow)}
              onApprove={() => handleRowApprove(drawerRow)}
              onReject={(reason) => handleRowReject(drawerRow, reason)}
            />
          ) : null
        }
      >
        {drawerRow ? (
          <dl className="space-y-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Type</dt>
              <dd>
                <Badge variant="secondary">{drawerRow.kind}</Badge>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Name</dt>
              <dd className="text-right font-medium">{drawerRow.title}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <StatusBadge status="PENDING" />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Submitted</dt>
              <dd>{drawerRow.submittedAt.toLocaleDateString("en-IN")}</dd>
            </div>
            <div className="border-border border-t pt-4">
              <Link href={approvalHref(drawerRow)} className="text-primary text-sm hover:underline">
                View full record →
              </Link>
            </div>
          </dl>
        ) : null}
      </DetailDrawer>
    </>
  );
}
