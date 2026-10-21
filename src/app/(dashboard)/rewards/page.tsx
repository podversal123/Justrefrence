import { msg } from "@/i18n/locales";
import { getFormat, getT } from "@/i18n/server";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Gift } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import { getMemberProfileByUserId } from "@/server/repositories/identity/member-repository";
import {
  listRewardsForMember,
  toRewardFacts,
} from "@/server/repositories/rewards/reward-repository";
import { rewardStatus, formatRewardNumber, type RewardStatus } from "@/server/domain/rewards/rules";
import { RewardStatusBadge, RewardTypeLabel } from "@/components/rewards/reward-badges";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { describeDiscount } from "@/lib/coupon-display";
import { formatPaise } from "@/lib/money";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Rewards") };
}

const SECTIONS: { key: RewardStatus; title: string; empty: string }[] = [
  { key: "UNUSED", title: msg("Unused"), empty: msg("No unused rewards right now.") },
  { key: "USED", title: msg("Used"), empty: msg("Nothing used yet.") },
  { key: "EXPIRED", title: msg("Expired"), empty: msg("Nothing has expired.") },
];

export default async function MyRewardsPage() {
  const t = await getT();
  const { formatDate } = await getFormat();
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("reward:read")) redirect("/unauthorized");

  const member = await getMemberProfileByUserId(session.userId);
  if (!member) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <h1>{t("Rewards")}</h1>
        <EmptyState
          icon={Gift}
          title={t("No member profile yet")}
          description={t("Rewards are paid to member accounts.")}
        />
      </div>
    );
  }

  const rewards = await listRewardsForMember(member.id);
  const now = new Date();
  const grouped: Record<RewardStatus, { reward: (typeof rewards)[number] }[]> = {
    UNUSED: [],
    USED: [],
    EXPIRED: [],
  };
  for (const reward of rewards) {
    grouped[rewardStatus(toRewardFacts(reward), now)].push({ reward });
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <div>
        <h1>{t("Rewards")}</h1>
        <p className="text-muted-foreground">
          {t("Coupons paid to you as rewards. Use them at checkout.")}
        </p>
      </div>

      {rewards.length === 0 ? (
        <EmptyState
          icon={Gift}
          title={t("No rewards yet")}
          description={t("When the team pays you a reward, it will show up here.")}
        />
      ) : (
        SECTIONS.map((section) => (
          <section
            key={section.key}
            aria-labelledby={`rewards-${section.key}`}
            className="space-y-3"
          >
            <h2 id={`rewards-${section.key}`} className="text-base font-semibold">
              {t(section.title)} ({grouped[section.key].length})
            </h2>
            {grouped[section.key].length === 0 ? (
              <p className="text-muted-foreground text-sm">{t(section.empty)}</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {grouped[section.key].map(({ reward }) => (
                  <li key={reward.id}>
                    <Card className={section.key === "UNUSED" ? "" : "opacity-80"}>
                      <CardContent className="space-y-2 py-4">
                        <div className="flex items-center justify-between gap-2">
                          <RewardTypeLabel type={reward.type} />
                          <RewardStatusBadge status={section.key} />
                        </div>
                        <p className="text-base font-semibold">{reward.title}</p>
                        {reward.type === "CASH" && reward.amount !== null ? (
                          <p className="text-lg font-semibold tabular-nums">
                            {formatPaise(reward.amount.toString(), "INR")}
                            <span className="text-muted-foreground text-xs font-normal">
                              {" "}
                              {t("added to your wallet")}
                            </span>
                          </p>
                        ) : null}
                        {reward.coupon ? (
                          <p className="text-sm">
                            <span className="font-mono text-base font-semibold">
                              {reward.coupon.code}
                            </span>
                            <span className="text-muted-foreground">
                              {" "}
                              · {describeDiscount(reward.coupon, t)}
                              {reward.coupon.minOrderAmount > 0n
                                ? ` ${t("on orders of {amount} or more", { amount: formatPaise(reward.coupon.minOrderAmount.toString(), "INR") })}`
                                : ""}
                            </span>
                          </p>
                        ) : null}
                        <p className="text-muted-foreground text-sm">{reward.reason}</p>
                        <p className="text-muted-foreground text-xs">
                          {formatRewardNumber(reward.rewardSeq)} ·{" "}
                          {t("Paid {date}", { date: formatDate(reward.createdAt) })}
                          {(reward.coupon?.expiresAt ?? reward.expiresAt)
                            ? ` · ${
                                section.key === "EXPIRED"
                                  ? t("Expired {date}", {
                                      date: formatDate(
                                        (reward.coupon?.expiresAt ?? reward.expiresAt) as Date,
                                      ),
                                    })
                                  : t("Use by {date}", {
                                      date: formatDate(
                                        (reward.coupon?.expiresAt ?? reward.expiresAt) as Date,
                                      ),
                                    })
                              }`
                            : ""}
                        </p>
                        {reward.type === "COUPON" && section.key === "UNUSED" ? (
                          <Link
                            href={"/cart" as Route}
                            className={buttonVariants({ size: "sm", variant: "outline" })}
                          >
                            {t("Use it at checkout")}
                          </Link>
                        ) : null}
                        {reward.type === "CASH" ? (
                          <Link
                            href={"/wallet" as Route}
                            className={buttonVariants({ size: "sm", variant: "outline" })}
                          >
                            {t("Open my wallet")}
                          </Link>
                        ) : null}
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))
      )}
    </div>
  );
}
