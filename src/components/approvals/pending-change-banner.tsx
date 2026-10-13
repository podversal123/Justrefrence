import Link from "next/link";
import type { Route } from "next";
import { Clock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { findPendingFor } from "@/server/repositories/approvals/change-repository";
import { formatDate } from "@/lib/format";
import type { ChangeEntityType } from "@/generated/prisma/enums";

/**
 * Shown on a record that has a change waiting for a Super Admin, so nobody is surprised that what they
 * see is not yet what was asked for, and nobody files a second request on top of it.
 */
export async function PendingChangeBanner({
  entityType,
  entityId,
}: {
  entityType: ChangeEntityType;
  entityId: string;
}) {
  const pending = await findPendingFor(entityType, entityId).catch(() => null);
  if (!pending) return null;
  const by = pending.requester.fullName ?? pending.requester.email;
  return (
    <Alert>
      <Clock className="size-4" />
      <AlertDescription>
        A change by {by} is waiting for a Super Admin to approve it (sent{" "}
        {formatDate(pending.createdAt)}). What you see below is the current version.{" "}
        <Link
          href={"/admin/approvals" as Route}
          className="text-primary font-medium hover:underline"
        >
          See the request
        </Link>
      </AlertDescription>
    </Alert>
  );
}
