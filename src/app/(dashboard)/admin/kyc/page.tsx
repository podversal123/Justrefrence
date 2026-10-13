import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink, FileCheck2 } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import {
  countDocumentsByStatus,
  listDocumentsForReview,
} from "@/server/repositories/kyc/kyc-repository";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CursorPagination } from "@/components/ui/pagination";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { DOCUMENT_LABELS } from "@/server/domain/kyc/rules";
import type { KycDocumentStatus } from "@/generated/prisma/enums";
import { KycReviewActions } from "./kyc-review-actions";

export const metadata: Metadata = { title: "KYC review" };

const STATUSES: { value: KycDocumentStatus; label: string }[] = [
  { value: "PENDING", label: "To review" },
  { value: "VERIFIED", label: "Verified" },
  { value: "REJECTED", label: "Rejected" },
];

export default async function AdminKycPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("kyc:review")) redirect("/unauthorized");

  const params = await searchParams;
  const status = STATUSES.find((s) => s.value === params["status"])?.value ?? "PENDING";

  const [{ items, nextCursor }, counts] = await Promise.all([
    listDocumentsForReview({ status, cursor: params["cursor"] }),
    countDocumentsByStatus(),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div>
        <h1>KYC review</h1>
        <p className="text-muted-foreground">
          Check each uploaded document against the number the person entered, then verify it or ask
          them to upload it again.
        </p>
      </div>

      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <Button
            key={s.value}
            variant={s.value === status ? "default" : "outline"}
            nativeButton={false}
            render={
              <Link href={`/admin/kyc?status=${s.value}` as Route}>
                {s.label} ({counts[s.value] ?? 0})
              </Link>
            }
          />
        ))}
      </nav>

      {items.length === 0 ? (
        <EmptyState
          icon={FileCheck2}
          title={status === "PENDING" ? "Nothing to review" : "No documents here"}
          description={
            status === "PENDING"
              ? "New uploads will appear here."
              : "Documents show up here after they are reviewed."
          }
        />
      ) : (
        <div className="surface-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Document</TableHead>
                <TableHead>PAN on file</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead className="text-right">
                  {status === "PENDING" ? "Decision" : "Status"}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((doc) => {
                const owner = doc.owner;
                const name = owner.vendorProfile?.businessName ?? owner.fullName ?? owner.email;
                const pan = owner.memberProfile?.pan ?? owner.vendorProfile?.pan ?? null;
                return (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <div className="font-medium">{name}</div>
                      <div className="text-muted-foreground text-xs">
                        {owner.memberProfile?.memberId ?? owner.email}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>{DOCUMENT_LABELS[doc.type]}</div>
                      <a
                        href={`/api/kyc/${doc.id}/file`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
                      >
                        Open document
                        <ExternalLink className="size-3" aria-hidden="true" />
                      </a>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {pan ?? <span className="text-destructive font-sans">Not entered</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {formatDate(doc.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      {doc.status === "PENDING" ? (
                        <div className="flex justify-end">
                          <KycReviewActions
                            documentId={doc.id}
                            documentLabel={DOCUMENT_LABELS[doc.type]}
                            personName={name}
                            panOnFile={pan}
                          />
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <StatusBadge status={doc.status} />
                          {doc.rejectedReason ? (
                            <p className="text-muted-foreground max-w-56 text-xs">
                              {doc.rejectedReason}
                            </p>
                          ) : null}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <CursorPagination nextCursor={nextCursor} />
    </div>
  );
}
