import { getT } from "@/i18n/server";
import { cn } from "@/lib/utils";

/**
 * A member's own Member ID and, when someone referred them, the Referral ID (that person's Member ID).
 * With nobody to name, the Referral ID is left out rather than shown empty.
 */
export async function MemberIds({
  memberId,
  referralId,
  className,
}: {
  memberId: string;
  referralId: string | null;
  className?: string;
}) {
  const t = await getT();
  return (
    <dl className={cn("flex flex-wrap gap-x-6 gap-y-2 text-sm", className)}>
      <div className="flex items-baseline gap-2">
        <dt className="text-muted-foreground">{t("Member ID")}</dt>
        <dd className="font-mono font-semibold tracking-wide">{memberId}</dd>
      </div>
      {referralId ? (
        <div className="flex items-baseline gap-2">
          <dt className="text-muted-foreground">{t("Referral ID")}</dt>
          <dd className="font-mono font-semibold tracking-wide">{referralId}</dd>
        </div>
      ) : null}
    </dl>
  );
}
