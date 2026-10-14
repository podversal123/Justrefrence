import { getT } from "@/i18n/server";
import type { Metadata } from "next";
import { getAuthSession } from "@/server/auth/session";
import { Card, CardContent } from "@/components/ui/card";
import { FeedbackForm } from "./feedback-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("Feedback"),
    description: t("Tell Justreference what's working and what isn't."),
  };
}

export default async function FeedbackPage() {
  const t = await getT();
  // Prefill for signed-in members; anyone else can still send feedback.
  const session = await getAuthSession();

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-12">
      <h1 className="mb-1">{t("Feedback")}</h1>
      <p className="text-muted-foreground mb-8">
        {t("Tell us what's working and what isn't. A person on our team reads every message.")}
      </p>
      <Card>
        <CardContent className="pt-6">
          <FeedbackForm defaultName={session?.fullName ?? ""} defaultEmail={session?.email ?? ""} />
        </CardContent>
      </Card>
    </div>
  );
}
