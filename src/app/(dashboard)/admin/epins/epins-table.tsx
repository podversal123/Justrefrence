import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { RevokeEpinButton } from "./revoke-epin-button";
import type { searchEpins } from "@/server/repositories/epin/epin-repository";

type EpinRow = Awaited<ReturnType<typeof searchEpins>>["items"][number];

/** Only `codeLast4` is ever available here — the raw code is never stored or returned again after generation (ADR-0015). */
function maskedCode(codeLast4: string): string {
  return `${"•".repeat(12)}${codeLast4}`;
}

export function EpinsTable({ epins, canRevoke }: { epins: EpinRow[]; canRevoke: boolean }) {
  const columns: DataTableColumn<EpinRow>[] = [
    {
      key: "code",
      header: "Code",
      cell: (row) => <span className="font-mono text-xs tracking-wide">{maskedCode(row.codeLast4)}</span>,
    },
    {
      key: "plan",
      header: "Plan",
      cell: (row) => row.plan.code,
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "generated",
      header: "Generated",
      cell: (row) => row.createdAt.toLocaleDateString(),
      hideOnMobile: true,
    },
    {
      key: "expires",
      header: "Expires",
      cell: (row) => (row.expiresAt ? row.expiresAt.toLocaleDateString() : "No expiry"),
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
