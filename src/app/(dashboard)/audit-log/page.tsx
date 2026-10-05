import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/server/auth/session";
import { prisma } from "@/server/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Audit log" };

/**
 * The one real, permission-gated data page in Phase 1 — proves RBAC, the
 * audit mechanism, and the unauthorized-access path end to end, without
 * reaching into any Phase 2+ module. See docs/rbac.md §4 (audit:read is
 * SUPER_ADMIN only) and docs/audit-logging.md §6.
 */
export default async function AuditLogPage() {
  const session = await getAuthSession();
  if (!session) redirect("/login");

  if (!session.permissions.has("audit:read")) {
    redirect("/unauthorized");
  }

  const entries = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { actor: { select: { email: true } } },
  });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1>Audit log</h1>
        <p className="text-muted-foreground">
          The most recent 50 entries, newest first. Visible to Super Admin only.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>
            Immutable — every row here was written once and is never edited or deleted. See
            docs/audit-logging.md.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              No audit entries yet. Sign in or out a few times to generate some.
            </p>
          ) : (
            <div className="divide-y">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-4 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{entry.action}</Badge>
                      <span className="text-muted-foreground truncate">
                        {entry.actor?.email ?? entry.entityId}
                      </span>
                    </div>
                    <div className="text-muted-foreground mt-0.5 text-xs">
                      {entry.entityType} · {entry.entityId}
                    </div>
                  </div>
                  <time
                    className="text-muted-foreground shrink-0 text-xs"
                    dateTime={entry.createdAt.toISOString()}
                  >
                    {entry.createdAt.toLocaleString()}
                  </time>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
