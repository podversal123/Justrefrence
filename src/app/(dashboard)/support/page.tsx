import { getT } from "@/i18n/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LifeBuoy } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import { listTicketsForUser } from "@/server/repositories/support/ticket-repository";
import { TicketsTable } from "@/components/support/tickets-table";
import { EmptyState } from "@/components/ui/empty-state";
import { NewTicketDialog } from "./new-ticket-dialog";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Support") };
}

export default async function SupportPage() {
  const t = await getT();
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("ticket:read")) redirect("/unauthorized");

  const canCreate = session.permissions.has("ticket:create");
  const tickets = await listTicketsForUser(session.userId);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1>{t("Support")}</h1>
          <p className="text-muted-foreground">{t("Your tickets and the team's replies.")}</p>
        </div>
        {canCreate ? <NewTicketDialog /> : null}
      </div>

      {tickets.length === 0 ? (
        <EmptyState
          icon={LifeBuoy}
          title={t("No tickets yet")}
          description={t(
            "If something isn't working (an order, a payment, your account), open a ticket and we'll reply here.",
          )}
          action={canCreate ? <NewTicketDialog /> : undefined}
        />
      ) : (
        <TicketsTable tickets={tickets} basePath="/support" showOwner={false} />
      )}
    </div>
  );
}
