import { Gavel, ScrollText } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function TypeBadge({ type }: { type: "TENDER" | "REVERSE_AUCTION" }) {
  return type === "REVERSE_AUCTION" ? (
    <Badge variant="info" className="gap-1">
      <Gavel className="size-3" aria-hidden="true" />
      Reverse auction
    </Badge>
  ) : (
    <Badge variant="secondary" className="gap-1">
      <ScrollText className="size-3" aria-hidden="true" />
      Sealed tender
    </Badge>
  );
}

const STATUS: Record<
  string,
  { label: string; variant: "success" | "secondary" | "info" | "destructive" }
> = {
  OPEN: { label: "Open", variant: "success" },
  CLOSED: { label: "Closed", variant: "secondary" },
  AWARDED: { label: "Awarded", variant: "info" },
  CANCELLED: { label: "Cancelled", variant: "destructive" },
};

export function RequirementStatusBadge({ status }: { status: string }) {
  const entry = STATUS[status] ?? { label: status, variant: "secondary" as const };
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
}

const BID_STATUS: Record<
  string,
  { label: string; variant: "success" | "secondary" | "info" | "destructive" | "warning" }
> = {
  ACTIVE: { label: "Active", variant: "info" },
  WITHDRAWN: { label: "Withdrawn", variant: "secondary" },
  ACCEPTED: { label: "Awarded to you", variant: "success" },
  REJECTED: { label: "Not selected", variant: "destructive" },
};

export function BidStatusBadge({ status }: { status: string }) {
  const entry = BID_STATUS[status] ?? { label: status, variant: "secondary" as const };
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
}
