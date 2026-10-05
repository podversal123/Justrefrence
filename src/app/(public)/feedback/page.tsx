import type { Metadata } from "next";
import { getAuthSession } from "@/server/auth/session";
import { Card, CardContent } from "@/components/ui/card";
import { FeedbackForm } from "./feedback-form";

export const metadata: Metadata = {
  title: "Feedback",
  description: "Tell Justreference what's working and what isn't.",
};

export default async function FeedbackPage() {
  // Prefill for signed-in members; anyone else can still send feedback.
  const session = await getAuthSession();

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-12">
      <h1 className="mb-1">Feedback</h1>
      <p className="text-muted-foreground mb-8">
        Tell us what&apos;s working and what isn&apos;t. A person on our team reads every message.
      </p>
      <Card>
        <CardContent className="pt-6">
          <FeedbackForm defaultName={session?.fullName ?? ""} defaultEmail={session?.email ?? ""} />
        </CardContent>
      </Card>
    </div>
  );
}
