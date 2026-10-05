import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import {
  countMembersByStatus,
  listMembers,
} from "@/server/repositories/identity/member-admin-repository";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { NativeSelect } from "@/components/ui/native-select";
import { CursorPagination } from "@/components/ui/pagination";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import type { UserStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Members" };

const STATUSES: UserStatus[] = ["ACTIVE", "PENDING_VERIFICATION", "BLOCKED"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("member:read:any")) redirect("/unauthorized");

  const params = await searchParams;
  const status = STATUSES.find((s) => s === params["status"]);
  const search = params["search"]?.slice(0, 100);
  const from = params["from"] && DATE_RE.test(params["from"]) ? params["from"] : undefined;
  const to = params["to"] && DATE_RE.test(params["to"]) ? params["to"] : undefined;

  const [{ members, nextCursor }, counts] = await Promise.all([
    listMembers({ search, status, from, to, cursor: params["cursor"] }),
    countMembersByStatus(),
  ]);
  const filtered = Boolean(search || status || from || to);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div>
        <h1>Members</h1>
        <p className="text-muted-foreground">
          {counts.ACTIVE ?? 0} active · {counts.PENDING_VERIFICATION ?? 0} pending ·{" "}
          {counts.BLOCKED ?? 0} blocked
        </p>
      </div>

      {/* Plain GET form: filters live in the URL, results are a server fetch. */}
      <form method="get" className="flex flex-wrap items-end gap-3" role="search">
        <div className="space-y-1">
          <label htmlFor="m-search" className="text-xs font-medium">
            Search
          </label>
          <Input
            id="m-search"
            name="search"
            defaultValue={search}
            placeholder="Name, email, mobile or member ID"
            className="w-64"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="m-status" className="text-xs font-medium">
            Status
          </label>
          <NativeSelect id="m-status" name="status" defaultValue={status ?? ""} className="w-44">
            <option value="">All</option>
            <option value="ACTIVE">Active</option>
            <option value="PENDING_VERIFICATION">Pending</option>
            <option value="BLOCKED">Blocked</option>
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <label htmlFor="m-from" className="text-xs font-medium">
            Joined from
          </label>
          <Input id="m-from" name="from" type="date" defaultValue={from} className="w-40" />
        </div>
        <div className="space-y-1">
          <label htmlFor="m-to" className="text-xs font-medium">
            Joined to
          </label>
          <Input id="m-to" name="to" type="date" defaultValue={to} className="w-40" />
        </div>
        <Button type="submit">Apply</Button>
        {filtered ? (
          <Button
            variant="ghost"
            nativeButton={false}
            render={<Link href={"/admin/members" as Route}>Clear</Link>}
          />
        ) : null}
      </form>

      {members.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No members found"
          description={
            filtered ? "Try widening the filters." : "Members appear here after they register."
          }
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="tabular-nums">{m.memberProfile?.memberId ?? "—"}</TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/members/${m.id}` as Route}
                      className="font-medium hover:underline"
                    >
                      {m.fullName ?? m.email}
                    </Link>
                    {m.vendorProfile ? (
                      <p className="text-muted-foreground text-xs">
                        Vendor: {m.vendorProfile.businessName}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm">
                    {m.email}
                    {m.phone ? <p className="text-muted-foreground text-xs">{m.phone}</p> : null}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={m.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(m.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <CursorPagination nextCursor={nextCursor} />
        </>
      )}
    </div>
  );
}
