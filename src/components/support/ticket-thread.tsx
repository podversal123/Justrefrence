import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

interface ThreadMessage {
  id: string;
  body: string;
  isStaffReply: boolean;
  createdAt: Date;
  author: { fullName: string | null; email: string };
}

export function TicketHeader({
  ticketLabel,
  subject,
  status,
  category,
  priority,
  createdAt,
  owner,
}: {
  ticketLabel: string;
  subject: string;
  status: string;
  category: string | null;
  priority: string;
  createdAt: Date;
  owner?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-sm tabular-nums">{ticketLabel}</span>
        <StatusBadge status={status} />
        {priority === "HIGH" ? <Badge variant="destructive">High priority</Badge> : null}
      </div>
      <h1>{subject}</h1>
      <p className="text-muted-foreground text-sm">
        {[category, owner ? `Opened by ${owner}` : null, formatDateTime(createdAt)]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </div>
  );
}

/** The conversation. Bodies are plain text and rendered as text (never HTML); whitespace is preserved. */
export function TicketThread({ messages }: { messages: ThreadMessage[] }) {
  return (
    <ol className="flex flex-col gap-3" aria-label="Conversation">
      {messages.map((message) => (
        <li key={message.id}>
          <Card className={cn(message.isStaffReply && "border-primary/30 bg-primary/5")}>
            <CardContent className="space-y-2 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <p className="font-medium">
                  {message.isStaffReply
                    ? "Justreference team"
                    : (message.author.fullName ?? message.author.email)}
                </p>
                <p className="text-muted-foreground text-xs">{formatDateTime(message.createdAt)}</p>
              </div>
              <p className="text-sm whitespace-pre-wrap">{message.body}</p>
            </CardContent>
          </Card>
        </li>
      ))}
    </ol>
  );
}
