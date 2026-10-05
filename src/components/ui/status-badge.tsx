import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type BadgeVariant =
  "default" | "secondary" | "destructive" | "success" | "warning" | "info" | "outline";

/*
 * Phase 10 fix: every "positive" status used to map onto `default`, which
 * renders in brand red — in financial/status UI, red reads as an alert,
 * not a good outcome. Positive/final states now use `success` (green),
 * in-progress states use `info` (blue), needs-attention states use
 * `warning` (amber), and only `default` (brand) is reserved for a small
 * set of "this is live/active" states where brand emphasis is intended.
 */
const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  ACTIVE: "success",
  APPROVED: "success",
  VERIFIED: "success",
  INACTIVE: "secondary",
  PENDING: "warning",
  PENDING_VERIFICATION: "warning",
  REJECTED: "destructive",
  SUSPENDED: "destructive",
  BLOCKED: "destructive",
  // Order statuses — docs/business-rules.md Q-26.
  PLACED: "secondary",
  PAID: "success",
  PROCESSING: "info",
  SHIPPED: "info",
  DELIVERED: "success",
  COMPLETED: "success",
  CANCELLED: "destructive",
  REFUNDED: "destructive",
  // Commission lifecycle — docs/adr/0014-commission-engine.md.
  ELIGIBLE: "secondary",
  AVAILABLE: "success",
  REVERSED: "destructive",
  // E-pin lifecycle — docs/adr/0015-wallet-epin-subscription.md. FRESH is
  // ready-to-redeem (good); USED is a neutral, expected end state (not a
  // failure); EXPIRED needs admin attention; REVOKED is a terminal, negative
  // admin action.
  FRESH: "success",
  USED: "secondary",
  EXPIRED: "warning",
  REVOKED: "destructive",
  // Payout lifecycle — member /wallet (Phase 11). APPROVED/PAID/REJECTED
  // already covered above; PROCESSING reuses the order-lifecycle entry.
  REQUESTED: "warning",
  FAILED: "destructive",
  // Support tickets and blog posts.
  OPEN: "warning",
  IN_PROGRESS: "info",
  RESOLVED: "success",
  CLOSED: "secondary",
  DRAFT: "secondary",
  PUBLISHED: "success",
  // Coupons.
  SCHEDULED: "info",
  USED_UP: "warning",
  DEACTIVATED: "secondary",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING_VERIFICATION: "Pending",
  IN_PROGRESS: "In progress",
  USED_UP: "Fully used",
};

/**
 * Generic status→badge mapping, reused across vendor approval status
 * (Phase 2) and listing approval/active status (Phase 3) — see the Phase 3
 * brief's "StatusBadge" reusable-component requirement.
 */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const variant = STATUS_VARIANTS[status] ?? "outline";
  const label = STATUS_LABELS[status] ?? status;
  return (
    <Badge variant={variant} className={cn(className)}>
      {label}
    </Badge>
  );
}
