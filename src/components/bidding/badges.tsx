import { T } from "@/i18n/t-text";
import { msg } from "@/i18n/locales";
import { getT } from "@/i18n/server";
import { Gavel, ScrollText } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export async function TypeBadge({ type }: { type: "TENDER" | "REVERSE_AUCTION" }) {
  const t = await getT();
  return type === "REVERSE_AUCTION" ? (
    <Badge variant="info" className="gap-1">
      <Gavel className="size-3" aria-hidden="true" />
      {t("Reverse auction")}
    </Badge>
  ) : (
    <Badge variant="secondary" className="gap-1">
      <ScrollText className="size-3" aria-hidden="true" />
      {t("Sealed tender")}
    </Badge>
  );
}

const STATUS: Record<
  string,
  { label: string; variant: "success" | "secondary" | "info" | "destructive" }
> = {
  OPEN: { label: msg("Open"), variant: "success" },
  CLOSED: { label: msg("Closed"), variant: "secondary" },
  AWARDED: { label: msg("Awarded"), variant: "info" },
  CANCELLED: { label: msg("Cancelled"), variant: "destructive" },
};

export function RequirementStatusBadge({ status }: { status: string }) {
  const entry = STATUS[status] ?? { label: status, variant: "secondary" as const };
  return (
    <Badge variant={entry.variant}>
      <T text={entry.label} />
    </Badge>
  );
}

const BID_STATUS: Record<
  string,
  { label: string; variant: "success" | "secondary" | "info" | "destructive" | "warning" }
> = {
  ACTIVE: { label: msg("Active"), variant: "info" },
  WITHDRAWN: { label: msg("Withdrawn"), variant: "secondary" },
  ACCEPTED: { label: msg("Awarded to you"), variant: "success" },
  REJECTED: { label: msg("Not selected"), variant: "destructive" },
};

export function BidStatusBadge({ status }: { status: string }) {
  const entry = BID_STATUS[status] ?? { label: status, variant: "secondary" as const };
  return (
    <Badge variant={entry.variant}>
      <T text={entry.label} />
    </Badge>
  );
}
