import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Gift, Search, UserX } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import { findMemberByEmail } from "@/server/repositories/identity/member-repository";
import {
  listRewardsForAdmin,
  toRewardFacts,
} from "@/server/repositories/rewards/reward-repository";
import { REWARD_TYPES } from "@/lib/schemas/reward";
import {
  REWARD_STATUS_LABEL,
  REWARD_TYPE_LABEL,
  formatRewardNumber,
  rewardStatus,
  type RewardStatus,
} from "@/server/domain/rewards/rules";
import { RewardStatusBadge, RewardTypeLabel } from "@/components/rewards/reward-badges";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { CursorPagination } from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { describeDiscount } from "@/lib/coupon-display";
import { formatDate } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import { PayRewardForm } from "./pay-reward-form";
import { MarkGivenButton } from "./mark-given-button";

export const metadata: Metadata = { title: "Rewards" };

const STATUSES: RewardStatus[] = ["UNUSED", "USED", "EXPIRED"];

export default async function AdminRewardsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("reward:read:any")) redirect("/unauthorized");
  const canPay = session.permissions.has("reward:grant");

  const params = await searchParams;
  const email = params["email"]?.trim() ?? "";
  const type = REWARD_TYPES.find((t) => t === params["type"]);
  const status = STATUSES.find((s) => s === params["status"]);
  const search = params["search"]?.slice(0, 100);

  const member = canPay && email ? await findMemberByEmail(email) : null;
  const now = new Date();
  const { items, nextCursor } = await listRewardsForAdmin(
    { type, status, search, cursor: params["cursor"] },
    now,
  );
  const filtered = Boolean(type || status || search);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <div>
        <h1>Rewards</h1>
        <p className="text-muted-foreground">
          Pay a reward to a member, and see every reward paid so far.
        </p>
      </div>

      {canPay ? (
        <section aria-labelledby="pay-heading" className="space-y-4">
          <h2 id="pay-heading" className="text-lg">
            Pay a reward
          </h2>
          <form method="get" role="search" className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label htmlFor="rw-email" className="text-xs font-medium">
                Member&apos;s email
              </label>
              <Input
                id="rw-email"
                name="email"
                type="email"
                defaultValue={email}
                placeholder="member@example.com"
                className="w-80"
              />
            </div>
            <Button type="submit">
              <Search />
              Find member
            </Button>
          </form>

          {email && !member ? (
            <EmptyState
              icon={UserX}
              title="No member with that email"
              description="Check the spelling, or find the member in the members list."
            />
          ) : null}
          {member && !member.memberId ? (
            <EmptyState
              icon={UserX}
              title="This account is not a member"
              description="Rewards can only be paid to members."
            />
          ) : null}
          {member?.memberId ? (
            <PayRewardForm
              userId={member.id}
              memberLabel={`${member.fullName ?? member.email} (${member.memberId})`}
            />
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="list-heading" className="space-y-4">
        <h2 id="list-heading" className="text-lg">
          Rewards list
        </h2>
        <form method="get" role="search" className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="rl-search" className="text-xs font-medium">
              Search
            </label>
            <Input
              id="rl-search"
              name="search"
              defaultValue={search}
              placeholder="Name, member ID, email or RWD-000012"
              className="w-72"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="rl-type" className="text-xs font-medium">
              Type
            </label>
            <NativeSelect id="rl-type" name="type" defaultValue={type ?? ""} className="w-44">
              <option value="">All types</option>
              {REWARD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {REWARD_TYPE_LABEL[t]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <label htmlFor="rl-status" className="text-xs font-medium">
              Status
            </label>
            <NativeSelect id="rl-status" name="status" defaultValue={status ?? ""} className="w-40">
              <option value="">All</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {REWARD_STATUS_LABEL[s]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Button type="submit">Apply</Button>
          {filtered ? (
            <Link
              href={"/admin/rewards" as Route}
              className={cn(buttonVariants({ variant: "ghost" }))}
            >
              Clear
            </Link>
          ) : null}
        </form>

        {items.length === 0 ? (
          <EmptyState
            icon={Gift}
            title={filtered ? "No rewards match" : "No rewards paid yet"}
            description={
              filtered ? "Try clearing a filter." : "Rewards you pay to members will appear here."
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reward</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Paid on</TableHead>
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((reward) => {
                  const state = rewardStatus(toRewardFacts(reward), now);
                  return (
                    <TableRow key={reward.id}>
                      <TableCell>
                        <p className="font-medium">{reward.title}</p>
                        <p className="text-muted-foreground text-xs tabular-nums">
                          {formatRewardNumber(reward.rewardSeq)}
                        </p>
                        <p className="text-muted-foreground max-w-xs text-xs">{reward.reason}</p>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm">
                          {reward.member.user.fullName ?? reward.member.user.email}
                        </p>
                        <p className="text-muted-foreground text-xs">{reward.member.memberId}</p>
                      </TableCell>
                      <TableCell>
                        <RewardTypeLabel type={reward.type} />
                      </TableCell>
                      <TableCell className="text-sm">
                        {reward.type === "CASH" && reward.amount !== null ? (
                          <span className="font-medium tabular-nums">
                            {formatPaise(reward.amount.toString(), "INR")}
                          </span>
                        ) : reward.coupon ? (
                          <>
                            <span className="font-mono font-medium">{reward.coupon.code}</span>
                            <p className="text-muted-foreground text-xs">
                              {describeDiscount(reward.coupon)}
                            </p>
                          </>
                        ) : (
                          <span className="text-muted-foreground">
                            {reward.expiresAt
                              ? `Claim by ${formatDate(reward.expiresAt)}`
                              : "No expiry"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <RewardStatusBadge status={state} />
                      </TableCell>
                      <TableCell className="text-sm">{formatDate(reward.createdAt)}</TableCell>
                      <TableCell>
                        {canPay && reward.type === "OTHER" && state === "UNUSED" ? (
                          <MarkGivenButton rewardId={reward.id} title={reward.title} />
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <CursorPagination nextCursor={nextCursor} />
          </>
        )}
      </section>
    </div>
  );
}
