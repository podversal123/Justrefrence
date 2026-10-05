import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import { searchEpins } from "@/server/repositories/epin/epin-repository";
import { listPlans } from "@/server/repositories/subscription/subscription-plan-repository";
import { epinSearchQuerySchema } from "@/lib/schemas/wallet";
import { EmptyState } from "@/components/ui/empty-state";
import { CursorPagination } from "@/components/ui/pagination";
import { EpinFilters } from "./epin-filters";
import { EpinsTable } from "./epins-table";
import { GenerateEpinDialog } from "./generate-epin-dialog";

export const metadata: Metadata = { title: "E-pins" };

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function EpinsPage({ searchParams }: PageProps) {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("epin:read:any")) redirect("/unauthorized");

  const rawParams = await searchParams;
  const parsed = epinSearchQuerySchema.safeParse(rawParams);
  const query = parsed.success ? parsed.data : epinSearchQuerySchema.parse({});

  const [{ items, nextCursor }, activePlans] = await Promise.all([
    searchEpins(query),
    listPlans(true),
  ]);

  const canGenerate = session.permissions.has("epin:generate");
  const canRevoke = session.permissions.has("epin:revoke");
  const hasActiveFilters = Boolean(query.status);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1>E-pins</h1>
          <p className="text-muted-foreground">
            Generate and manage single-use prepaid codes for subscription plans.
          </p>
        </div>
        {canGenerate ? (
          <GenerateEpinDialog
            plans={activePlans.map((plan) => ({ id: plan.id, code: plan.code, type: plan.type }))}
          />
        ) : null}
      </div>

      <EpinFilters />

      {items.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title={hasActiveFilters ? "No e-pins match your filters" : "No e-pins yet"}
          description={
            hasActiveFilters
              ? "Try a different status filter."
              : canGenerate
                ? "Generate the first e-pin to get started."
                : undefined
          }
        />
      ) : (
        <EpinsTable epins={items} canRevoke={canRevoke} />
      )}

      <CursorPagination nextCursor={nextCursor} />
    </div>
  );
}
