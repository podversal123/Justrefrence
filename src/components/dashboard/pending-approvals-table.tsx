"use client";

import { useFormat, useT } from "@/i18n/provider";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { AlertCircle, Check, ClipboardCheck, Eye, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { BulkApproveAction, BulkRejectAction } from "@/components/dashboard/bulk-dialogs";
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
  const t = useT();
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
              {t("Reject")}
            </Button>
          }
        />
        <DialogContent>
          <form onSubmit={submitReject} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>{t('Reject "{title}"?', { title: row.title })}</DialogTitle>
              <DialogDescription>
                {row.kind === "VENDOR"
                  ? t("The vendor will see this reason on their profile.")
                  : t("The vendor will see this reason.")}
              </DialogDescription>
            </DialogHeader>

            {error ? (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="drawer-reject-reason">{t("Reason")}</Label>
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
                {busy ? t("Working…") : t("Reject")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Button size="sm" onClick={onApprove} disabled={busy}>
        <Check />
        {busy ? t("Working…") : t("Approve")}
      </Button>
    </div>
  );
}

export function PendingApprovalsTable({ items }: { items: PendingApprovalRow[] }) {
  const t = useT();
  const { formatDate } = useFormat();
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
      toast.success(t('"{title}" approved', { title: row.title }));
      dropFromSelection(key);
      setDrawerRow((current) => (current && rowKey(current) === key ? null : current));
      router.refresh();
    } else {
      toast.error(t("Could not approve"), result.error.message);
    }
  }

  async function handleRowReject(
    row: PendingApprovalRow,
    reason: string,
  ): Promise<ApiResult<null>> {
    const key = rowKey(row);
    setBusyKey(key);
    const result = await rejectRow(row, reason);
    setBusyKey(null);
    if (result.success) {
      toast.success(t('"{title}" rejected', { title: row.title }));
      dropFromSelection(key);
      setDrawerRow((current) => (current && rowKey(current) === key ? null : current));
      router.refresh();
    } else {
      toast.error(t("Could not reject"), result.error.message);
    }
    return result;
  }

  async function handleBulkApprove() {
    const rows = selectedRows;
    const results = await Promise.all(rows.map((row) => approveRow(row)));
    const failed = results.filter((result) => !result.success).length;
    if (failed === 0) {
      toast.success(
        rows.length === 1
          ? t("Approved 1 item")
          : t("Approved {count} items", { count: rows.length }),
      );
    } else if (failed === rows.length) {
      toast.error(t("Bulk approve failed"), t("None of the selected items could be approved."));
    } else {
      toast.warning(
        t("Approved {done} of {total}", { done: rows.length - failed, total: rows.length }),
        t("{count} failed. Open them one by one to see why.", { count: failed }),
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
      toast.success(
        rows.length === 1
          ? t("Rejected 1 item")
          : t("Rejected {count} items", { count: rows.length }),
      );
    } else if (failed === rows.length) {
      toast.error(t("Bulk reject failed"), t("None of the selected items could be rejected."));
    } else {
      toast.warning(
        t("Rejected {done} of {total}", { done: rows.length - failed, total: rows.length }),
        t("{count} failed. Open them one by one to see why.", { count: failed }),
      );
    }
    clearSelection();
    router.refresh();
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Pending approvals")}</CardTitle>
          <CardDescription>
            {t("Vendor applications and new listings awaiting review.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <BulkActionToolbar
            count={selected.size}
            onClear={clearSelection}
            actions={
              <>
                <BulkApproveAction
                  title={
                    selectedRows.length === 1
                      ? t("Approve 1 item?")
                      : t("Approve {count} items?", { count: selectedRows.length })
                  }
                  description={t(
                    "Each vendor or listing is approved individually, the same as approving one at a time.",
                  )}
                  onConfirm={handleBulkApprove}
                />
                <BulkRejectAction
                  title={
                    selectedRows.length === 1
                      ? t("Reject 1 item?")
                      : t("Reject {count} items?", { count: selectedRows.length })
                  }
                  description={t("The same reason is applied to every selected vendor or listing.")}
                  onConfirm={handleBulkReject}
                />
              </>
            }
          />

          {items.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title={t("All caught up")}
              description={t("Nothing is waiting for review.")}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected}
                      indeterminate={someSelected}
                      onCheckedChange={(checked) => toggleAll(checked === true)}
                      aria-label={t("Select all pending approvals")}
                    />
                  </TableHead>
                  <TableHead>{t("Type")}</TableHead>
                  <TableHead>{t("Name")}</TableHead>
                  <TableHead>{t("Status")}</TableHead>
                  <TableHead>{t("Submitted")}</TableHead>
                  <TableHead className="text-right">{t("Actions")}</TableHead>
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
                          aria-label={t("Select {title}", { title: row.title })}
                        />
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{row.kind}</Badge>
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          className="text-left hover:underline"
                          onClick={() => setDrawerRow(row)}
                        >
                          {row.title}
                        </button>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status="PENDING" />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {formatDate(row.submittedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDrawerRow(row)}
                          disabled={isBusy}
                        >
                          <Eye />
                          {t("View")}
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
              <dt className="text-muted-foreground">{t("Type")}</dt>
              <dd>
                <Badge variant="secondary">{drawerRow.kind}</Badge>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">{t("Name")}</dt>
              <dd className="text-right font-medium">{drawerRow.title}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">{t("Status")}</dt>
              <dd>
                <StatusBadge status="PENDING" />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">{t("Submitted")}</dt>
              <dd>{formatDate(drawerRow.submittedAt)}</dd>
            </div>
            <div className="border-border border-t pt-4">
              <Link href={approvalHref(drawerRow)} className="text-primary text-sm hover:underline">
                {t("View full record →")}
              </Link>
            </div>
          </dl>
        ) : null}
      </DetailDrawer>
    </>
  );
}
