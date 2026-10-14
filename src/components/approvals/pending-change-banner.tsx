import { getFormat, getT } from "@/i18n/server";
import Link from "next/link";
import type { Route } from "next";
import { Clock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { findPendingFor } from "@/server/repositories/approvals/change-repository";
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
  const t = await getT();
  const { formatDate } = await getFormat();
  const pending = await findPendingFor(entityType, entityId).catch(() => null);
  if (!pending) return null;
  const by = pending.requester.fullName ?? pending.requester.email;
  return (
    <Alert>
      <Clock className="size-4" />
      <AlertDescription>
        {t(
          "A change by {name} is waiting for a Super Admin to approve it (sent {date}). What you see below is the current version.",
          { name: by, date: formatDate(pending.createdAt) },
        )}{" "}
        <Link
          href={"/admin/approvals" as Route}
          className="text-primary font-medium hover:underline"
        >
          {t("See the request")}
        </Link>
      </AlertDescription>
    </Alert>
  );
}
