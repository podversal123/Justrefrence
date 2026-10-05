import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/server/auth/session";
import { listRules } from "@/server/repositories/commission/commission-rule-repository";
import { formatPaise } from "@/lib/money";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Percent } from "lucide-react";
import { CreateCommissionRuleForm } from "./create-commission-rule-form";

export const metadata: Metadata = { title: "Commission rules" };

function describeRate(rule: { rateBasis: string; rateValueBps: number | null; rateValueFixed: bigint | null }) {
  if (rule.rateBasis === "FIXED") return formatPaise(rule.rateValueFixed?.toString() ?? "0");
  return `${((rule.rateValueBps ?? 0) / 100).toFixed(2)}%`;
}

export default async function CommissionRulesPage() {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("commission_rule:read")) redirect("/unauthorized");

  const rules = await listRules();
  const canEdit = session.permissions.has("commission_rule:update");

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1>Commission rules</h1>
        <p className="text-muted-foreground">
          Every rate is configured here — nothing is hardcoded. Activating a new version closes out the
          previous one automatically.
        </p>
      </div>

      {canEdit ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Create a new rule version</CardTitle>
            <CardDescription>
              Only SUPER_ADMIN may activate a rule — see docs/rbac.md.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CreateCommissionRuleForm />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All versions</CardTitle>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <EmptyState
              icon={Percent}
              title="No commission rules configured"
              description="Until a rule is created here, no commission is ever calculated — see docs/business-rules.md Q-02."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Level</TableHead>
                  <TableHead>Applies to</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Release delay</TableHead>
                  <TableHead>Effective</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell>{rule.level}</TableCell>
                    <TableCell>{rule.appliesTo}</TableCell>
                    <TableCell>
                      {describeRate(rule)} <span className="text-muted-foreground text-xs">({rule.rateBasis})</span>
                    </TableCell>
                    <TableCell>{rule.releaseDelayDays}d</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {rule.effectiveFrom.toLocaleDateString()}
                      {rule.effectiveTo ? ` – ${rule.effectiveTo.toLocaleDateString()}` : " – now"}
                    </TableCell>
                    <TableCell>
                      {rule.effectiveTo === null ? <Badge>Active</Badge> : <Badge variant="outline">Superseded</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
