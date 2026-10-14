import { T } from "@/i18n/t-text";
import { msg } from "@/i18n/locales";
import { Badge } from "@/components/ui/badge";

const STATUS: Record<
  string,
  { label: string; variant: "success" | "secondary" | "info" | "destructive" }
> = {
  OPEN: { label: msg("Open"), variant: "success" },
  SOLD: { label: msg("Sold"), variant: "info" },
  UNSOLD: { label: msg("Ended, not sold"), variant: "secondary" },
  CANCELLED: { label: msg("Cancelled"), variant: "destructive" },
};

export function AuctionStatusBadge({ status }: { status: string }) {
  const entry = STATUS[status] ?? { label: status, variant: "secondary" as const };
  return (
    <Badge variant={entry.variant}>
      <T text={entry.label} />
    </Badge>
  );
}
