import { getFormat, getT } from "@/i18n/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FileUser } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import { prisma } from "@/server/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ResumeRowActions } from "./resume-row-actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Résumés") };
}

export default async function AdminResumesPage() {
  const t = await getT();
  const { formatDate } = await getFormat();
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("career:manage")) redirect("/unauthorized");

  const [rows, newCount] = await Promise.all([
    prisma.resumeSubmission.findMany({
      orderBy: [{ createdAt: "desc" }],
      take: 100,
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        position: true,
        message: true,
        fileName: true,
        fileSize: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.resumeSubmission.count({ where: { status: "NEW" } }),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <h1>{t("Résumés")}</h1>
        <p className="text-muted-foreground">
          {t("Résumés sent through the Careers page. Only staff with this access can open them.")}{" "}
          {newCount > 0 ? t("{count} not yet reviewed.", { count: newCount }) : null}
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={FileUser}
          title={t("No résumés yet")}
          description={t("Résumés sent from the Careers page will appear here.")}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.id} className="surface-card space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold">{row.fullName}</h2>
                    <Badge variant={row.status === "NEW" ? "default" : "secondary"}>
                      {row.status === "NEW" ? t("New") : t("Reviewed")}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {row.position} · {formatDate(row.createdAt)}
                  </p>
                  <p className="text-sm break-all">
                    <a href={`mailto:${row.email}`} className="text-primary underline">
                      {row.email}
                    </a>
                    {row.phone ? ` · ${row.phone}` : ""}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {row.fileName} · {Math.max(1, Math.round(row.fileSize / 1024))} KB
                  </p>
                </div>
                <ResumeRowActions id={row.id} status={row.status} fileName={row.fileName} />
              </div>
              {row.message ? (
                <p className="bg-muted/50 rounded-md p-3 text-sm whitespace-pre-line">
                  {row.message}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
