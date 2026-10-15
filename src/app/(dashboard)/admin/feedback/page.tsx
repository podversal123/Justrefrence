import { getFormat, getT } from "@/i18n/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MessageSquareText } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import { listFeedback } from "@/server/repositories/content/feedback-repository";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ReviewedButton } from "./reviewed-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Customer feedback") };
}

export default async function AdminFeedbackPage() {
  const t = await getT();
  const { formatDateTime } = await getFormat();
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("feedback:read")) redirect("/unauthorized");

  const items = await listFeedback();
  const unreviewed = items.filter((f) => !f.reviewedAt).length;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1>{t("Customer feedback")}</h1>
        <p className="text-muted-foreground">
          {t("{count} not yet reviewed", { count: unreviewed })}
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={MessageSquareText}
          title={t("No feedback yet")}
          description={t("Messages sent from the public Feedback page appear here.")}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.id}>
              <Card>
                <CardContent className="space-y-2 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">
                      {item.name}{" "}
                      <span className="text-muted-foreground font-normal">· {item.email}</span>
                    </p>
                    <div className="flex items-center gap-2">
                      {item.rating ? <Badge variant="secondary">{item.rating} / 5</Badge> : null}
                      <span className="text-muted-foreground text-xs">
                        {formatDateTime(item.createdAt)}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{item.message}</p>
                  {item.reviewedAt ? (
                    <p className="text-muted-foreground text-xs">
                      {t("Reviewed {date}", { date: formatDateTime(item.reviewedAt) })}
                    </p>
                  ) : (
                    <ReviewedButton feedbackId={item.id} />
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
