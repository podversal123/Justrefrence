import { msg } from "@/i18n/locales";
import { getFormat, getT } from "@/i18n/server";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { RevokeEpinButton } from "./revoke-epin-button";
import type { searchEpins } from "@/server/repositories/epin/epin-repository";

type EpinRow = Awaited<ReturnType<typeof searchEpins>>["items"][number];

/** Only `codeLast4` is ever available here — the raw code is never stored or returned again after generation (ADR-0015). */
function maskedCode(codeLast4: string): string {
  return `${"•".repeat(12)}${codeLast4}`;
}

export async function EpinsTable({ epins, canRevoke }: { epins: EpinRow[]; canRevoke: boolean }) {
  const t = await getT();
  const { formatDate } = await getFormat();
  const columns: DataTableColumn<EpinRow>[] = [
    {
      key: "code",
      header: msg("Code"),
      cell: (row) => (
        <span className="font-mono text-xs tracking-wide">{maskedCode(row.codeLast4)}</span>
      ),
    },
    {
      key: "plan",
      header: msg("Plan"),
      cell: (row) => row.plan.code,
    },
    {
      key: "status",
      header: msg("Status"),
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "generated",
      header: msg("Generated"),
      cell: (row) => formatDate(row.createdAt),
      hideOnMobile: true,
    },
    {
      key: "expires",
      header: msg("Expires"),
      cell: (row) => (row.expiresAt ? formatDate(row.expiresAt) : t("No expiry")),
    },
    ...(canRevoke
      ? [
          {
            key: "actions",
            header: "",
            className: "text-right",
            cell: (row: EpinRow) =>
              row.status === "FRESH" || row.status === "USED" ? (
                <div className="flex justify-end">
                  <RevokeEpinButton epinId={row.id} codeLast4={row.codeLast4} />
                </div>
              ) : null,
          },
        ]
      : []),
  ];

  return <DataTable columns={columns} rows={epins} getRowKey={(row) => row.id} />;
}
