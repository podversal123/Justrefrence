import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ClipboardCheck } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import {
  countChangesByStatus,
  listChanges,
} from "@/server/repositories/approvals/change-repository";
import { ENTITY_LABELS, entityPath } from "@/server/domain/approvals/handlers";
import type { DiffEntry } from "@/server/domain/approvals/diff";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CursorPagination } from "@/components/ui/pagination";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate } from "@/lib/format";
import type { ChangeRequestStatus } from "@/generated/prisma/enums";
import { ChangeReviewActions } from "./change-review-actions";

export const metadata: Metadata = { title: "Approvals" };

const STATUSES: { value: ChangeRequestStatus; label: string }[] = [
  { value: "PENDING", label: "Waiting" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
];

function Value({ value }: { value: string | null }) {
  return value ? (
    <span className="break-words">{value}</span>
  ) : (
    <span className="text-muted-foreground italic">empty</span>
  );
}

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  const canReview = session.permissions.has("change:review");
  if (!canReview && !session.permissions.has("change:request")) redirect("/unauthorized");

  const params = await searchParams;
  const status = STATUSES.find((s) => s.value === params["status"])?.value ?? "PENDING";
  // Reviewers see everyone's requests; an admin sees their own.
  const ownOnlyUserId = canReview ? undefined : session.userId;

  const [{ items, nextCursor }, counts] = await Promise.all([
    listChanges({ status, ownOnlyUserId, cursor: params["cursor"] }),
    countChangesByStatus(ownOnlyUserId),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <h1>Approvals</h1>
        <p className="text-muted-foreground">
          {canReview
            ? "Changes asked for by admins. Read what changes, then approve it or reject it."
            : "Changes you asked for. A Super Admin approves each one before it goes live."}
        </p>
      </div>

      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <Button
            key={s.value}
            variant={s.value === status ? "default" : "outline"}
            nativeButton={false}
            render={
              <Link href={`/admin/approvals?status=${s.value}` as Route}>
                {s.label} ({counts[s.value] ?? 0})
              </Link>
            }
          />
        ))}
      </nav>

      {items.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={status === "PENDING" ? "Nothing is waiting" : "Nothing here yet"}
          description={
            status === "PENDING"
              ? canReview
                ? "When an admin asks for a change, it shows up here."
                : "When you edit a member, vendor or listing, your request shows up here."
              : "Decided requests are listed here."
          }
        />
      ) : (
        <ul className="space-y-4">
          {items.map((request) => {
            const diff = request.diff as unknown as DiffEntry[];
            const by = request.requester.fullName ?? request.requester.email;
            const reviewer = request.reviewer
              ? (request.reviewer.fullName ?? request.reviewer.email)
              : null;
            return (
              <li key={request.id} className="surface-card space-y-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <p className="text-muted-foreground text-xs">
                      {ENTITY_LABELS[request.entityType]}
                    </p>
                    <Link
                      href={entityPath(request.entityType, request.entityId) as Route}
                      className="inline-flex items-center gap-1 text-lg font-semibold hover:underline"
                    >
                      {request.entityLabel}
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </Link>
                    <p className="text-muted-foreground text-sm">
                      Asked by {by} on {formatDate(request.createdAt)}
                    </p>
                  </div>
                  {request.status !== "PENDING" ? <StatusBadge status={request.status} /> : null}
                </div>

                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-muted-foreground text-left text-xs">
                      <tr>
                        <th className="px-3 py-2 font-medium">What</th>
                        <th className="px-3 py-2 font-medium">Now</th>
                        <th className="px-3 py-2 font-medium">Asked to become</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {diff.map((d) => (
                        <tr key={d.field}>
                          <td className="px-3 py-2 font-medium">{d.label}</td>
                          <td className="px-3 py-2">
                            <Value value={d.from} />
                          </td>
                          <td className="px-3 py-2">
                            <Value value={d.to} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {request.requestNote ? (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Note from {by}: </span>
                    {request.requestNote}
                  </p>
                ) : null}

                {request.status === "PENDING" ? (
                  canReview ? (
                    <ChangeReviewActions requestId={request.id} recordName={request.entityLabel} />
                  ) : (
                    <p className="text-muted-foreground text-sm">Waiting for a Super Admin.</p>
                  )
                ) : (
                  <p className="text-muted-foreground text-sm">
                    {request.status === "APPROVED" ? "Approved" : "Rejected"} by{" "}
                    {reviewer ?? "a Super Admin"}
                    {request.reviewedAt ? ` on ${formatDate(request.reviewedAt)}` : ""}.
                    {request.reviewNote ? ` Note: ${request.reviewNote}` : ""}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <CursorPagination nextCursor={nextCursor} />
    </div>
  );
}
