import Link from "next/link";
import type { Route } from "next";
import { Clock, MapPin, Package, Users } from "lucide-react";
import { Countdown } from "@/components/bidding/countdown";
import { RequirementStatusBadge, TypeBadge } from "@/components/bidding/badges";
import { formatRequirementNumber, effectiveStatus } from "@/server/domain/bidding/rules";
import { formatPaise } from "@/lib/money";

export interface RequirementCardData {
  id: string;
  reqSeq: bigint;
  title: string;
  itemKind: string;
  categoryLabel: string | null;
  quantity: number;
  unit: string;
  deliveryCity: string | null;
  type: "TENDER" | "REVERSE_AUCTION";
  status: "OPEN" | "CLOSED" | "AWARDED" | "CANCELLED";
  closesAt: Date;
  estimatedValue: bigint | null;
  buyer: { fullName: string | null };
  _count: { bids: number };
}

const KIND_LABEL: Record<string, string> = {
  PRODUCT: "Product",
  SERVICE: "Service",
  PROJECT: "Project",
};

/** One row in a bids list — shared by the public browse page, "my requirements", "my bids" and the admin list. */
export function RequirementCard({
  requirement,
  serverNow,
  href,
}: {
  requirement: RequirementCardData;
  serverNow: Date;
  href: string;
}) {
  const status = effectiveStatus(requirement, serverNow);
  const open = status === "OPEN";
  return (
    <Link
      href={href as Route}
      className="hover:border-primary/40 hover:bg-accent focus-visible:ring-ring/50 block rounded-lg border p-4 outline-none focus-visible:ring-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-xs font-medium tabular-nums">
            {formatRequirementNumber(requirement.reqSeq)}
          </span>
          <TypeBadge type={requirement.type} />
          <RequirementStatusBadge status={status} />
        </div>
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Clock className="text-muted-foreground size-4" aria-hidden="true" />
          {open ? (
            <Countdown
              closesAt={requirement.closesAt.toISOString()}
              serverNow={serverNow.toISOString()}
            />
          ) : (
            <span className="text-muted-foreground">Closed</span>
          )}
        </span>
      </div>

      <h3 className="mt-2 text-base font-semibold">{requirement.title}</h3>

      <dl className="text-muted-foreground mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <div className="flex items-center gap-1.5">
          <Package className="size-4" aria-hidden="true" />
          <dt className="sr-only">Quantity</dt>
          <dd>
            {requirement.quantity.toLocaleString("en-IN")} {requirement.unit} ·{" "}
            {KIND_LABEL[requirement.itemKind] ?? requirement.itemKind}
            {requirement.categoryLabel ? ` · ${requirement.categoryLabel}` : ""}
          </dd>
        </div>
        {requirement.deliveryCity ? (
          <div className="flex items-center gap-1.5">
            <MapPin className="size-4" aria-hidden="true" />
            <dt className="sr-only">Deliver to</dt>
            <dd>{requirement.deliveryCity}</dd>
          </div>
        ) : null}
        <div className="flex items-center gap-1.5">
          <Users className="size-4" aria-hidden="true" />
          <dt className="sr-only">Bids</dt>
          <dd>
            {requirement._count.bids} bid{requirement._count.bids === 1 ? "" : "s"}
          </dd>
        </div>
        {requirement.estimatedValue !== null ? (
          <div>
            <dt className="inline">Max budget </dt>
            <dd className="text-foreground inline font-medium tabular-nums">
              {formatPaise(requirement.estimatedValue.toString(), "INR")}
            </dd>
          </div>
        ) : null}
      </dl>
    </Link>
  );
}
