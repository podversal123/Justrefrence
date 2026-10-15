import { msg } from "@/i18n/locales";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Inbox } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import {
  countTicketsByStatus,
  listAllTickets,
} from "@/server/repositories/support/ticket-repository";
import { TicketsTable } from "@/components/support/tickets-table";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar, SelectFilter } from "@/components/ui/filter-bar";
import { SearchInput } from "@/components/ui/search-input";
import type { TicketStatus } from "@/generated/prisma/enums";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Support tickets") };
}

const STATUSES: TicketStatus[] = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const t = await getT();
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("ticket:read:any")) redirect("/unauthorized");

  const params = await searchParams;
  const status = STATUSES.find((s) => s === params["status"]);
  const search = params["search"]?.slice(0, 100);

  const [tickets, counts] = await Promise.all([
    listAllTickets({ status, search }),
    countTicketsByStatus(),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <h1>{t("Support tickets")}</h1>
        <p className="text-muted-foreground">
          {t("{open} open · {progress} in progress · {resolved} resolved", {
            open: counts.OPEN ?? 0,
            progress: counts.IN_PROGRESS ?? 0,
            resolved: counts.RESOLVED ?? 0,
          })}
        </p>
      </div>

      <FilterBar>
        <SearchInput placeholder={t("Search subject or member…")} className="sm:w-72" />
        <SelectFilter
          paramName="status"
          ariaLabel={msg("Filter by status")}
          placeholder={t("All statuses")}
          options={[
            { value: "ALL", label: "All statuses" },
            { value: "OPEN", label: "Open" },
            { value: "IN_PROGRESS", label: "In progress" },
            { value: "RESOLVED", label: "Resolved" },
            { value: "CLOSED", label: "Closed" },
          ]}
        />
      </FilterBar>

      {tickets.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={t("No tickets match")}
          description={
            status || search
              ? t("Try clearing the filters.")
              : t("New tickets from members will appear here.")
          }
        />
      ) : (
        <TicketsTable tickets={tickets} basePath="/admin/support" showOwner />
      )}
    </div>
  );
}
