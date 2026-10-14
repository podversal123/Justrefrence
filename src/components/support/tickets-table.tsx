import { getFormat, getT } from "@/i18n/server";
import Link from "next/link";
import type { Route } from "next";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatTicketNo } from "@/server/repositories/support/ticket-repository";

interface TicketRow {
  id: string;
  ticketNo: number;
  subject: string;
  category: string | null;
  priority: string;
  status: string;
  updatedAt: Date;
  user: { fullName: string | null; email: string };
}

export async function TicketsTable({
  tickets,
  basePath,
  showOwner,
}: {
  tickets: TicketRow[];
  basePath: "/support" | "/admin/support";
  showOwner: boolean;
}) {
  const t = await getT();
  const { formatDateTime } = await getFormat();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("Ticket")}</TableHead>
          <TableHead>{t("Subject")}</TableHead>
          {showOwner ? <TableHead>{t("Member")}</TableHead> : null}
          <TableHead>{t("Status")}</TableHead>
          <TableHead>{t("Last update")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tickets.map((ticket) => (
          <TableRow key={ticket.id}>
            <TableCell className="text-muted-foreground tabular-nums">
              {formatTicketNo(ticket.ticketNo)}
            </TableCell>
            <TableCell className="max-w-xs">
              <Link
                href={`${basePath}/${ticket.id}` as Route}
                className="font-medium hover:underline"
              >
                {ticket.subject}
              </Link>
              <div className="text-muted-foreground flex items-center gap-2 text-xs">
                {ticket.category}
                {ticket.priority === "HIGH" ? (
                  <Badge variant="destructive">{t("High")}</Badge>
                ) : null}
              </div>
            </TableCell>
            {showOwner ? <TableCell>{ticket.user.fullName ?? ticket.user.email}</TableCell> : null}
            <TableCell>
              <StatusBadge status={ticket.status} />
            </TableCell>
            <TableCell className="text-muted-foreground text-sm">
              {formatDateTime(ticket.updatedAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
