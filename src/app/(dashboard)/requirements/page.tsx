import { getT } from "@/i18n/server";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList, Plus } from "lucide-react";
import { RequirementCard } from "@/components/bidding/requirement-card";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getAuthSession } from "@/server/auth/session";
import { listRequirementsForBuyer } from "@/server/repositories/bidding/bidding-repository";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Requirements") };
}

export default async function MyRequirementsPage() {
  const t = await getT();
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("requirement:create")) redirect("/unauthorized");

  const requirements = await listRequirementsForBuyer(session.userId);
  const now = new Date();

  const postButton = (
    <Link href={"/requirements/new" as Route} className={buttonVariants()}>
      <Plus />
      {t("Post a requirement")}
    </Link>
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1>{t("Requirements")}</h1>
          <p className="text-muted-foreground">
            {t("What you've asked vendors to bid on, and the offers that came in.")}
          </p>
        </div>
        {postButton}
      </div>

      {requirements.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={t("No requirements yet")}
          description={t(
            "Post what you need and approved vendors will bid, in a sealed tender or a live reverse auction.",
          )}
          action={postButton}
        />
      ) : (
        <ul className="space-y-3">
          {requirements.map((requirement) => (
            <li key={requirement.id}>
              <RequirementCard
                requirement={requirement}
                serverNow={now}
                href={`/requirements/${requirement.id}`}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
