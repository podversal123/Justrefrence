import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import { RequirementForm } from "../requirement-form";

export const metadata: Metadata = { title: "Post a requirement" };

export default async function NewRequirementPage() {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("requirement:create")) redirect("/unauthorized");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link
        href={"/requirements" as Route}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" />
        My requirements
      </Link>
      <div>
        <h1>Post a requirement</h1>
        <p className="text-muted-foreground">
          Describe what you need. Approved vendors can bid straight away, and you award the offer
          you prefer once bidding closes.
        </p>
      </div>
      <RequirementForm />
    </div>
  );
}
