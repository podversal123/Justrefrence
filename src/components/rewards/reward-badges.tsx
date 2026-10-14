import { T } from "@/i18n/t-text";
import { Banknote, Gift, TicketPercent } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  REWARD_STATUS_LABEL,
  REWARD_TYPE_LABEL,
  type RewardStatus,
  type RewardType,
} from "@/server/domain/rewards/rules";

const STATUS_VARIANT: Record<RewardStatus, "success" | "info" | "secondary"> = {
  UNUSED: "info",
  USED: "success",
  EXPIRED: "secondary",
};

export function RewardStatusBadge({ status }: { status: RewardStatus }) {
  return (
    <Badge variant={STATUS_VARIANT[status]}>
      <T text={REWARD_STATUS_LABEL[status]} />
    </Badge>
  );
}

const TYPE_ICON = { CASH: Banknote, COUPON: TicketPercent, OTHER: Gift } as const;

export function RewardTypeLabel({ type }: { type: RewardType }) {
  const Icon = TYPE_ICON[type];
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <Icon className="text-muted-foreground size-4" aria-hidden="true" />
      <T text={REWARD_TYPE_LABEL[type]} />
    </span>
  );
}
