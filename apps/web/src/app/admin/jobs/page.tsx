import { getServiceRoleClient } from "@asesor/db/service";

import { DataTable, formatDate, StatusBadge } from "@/components/admin/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdminUser } from "@/lib/auth";

import { retryJobAction } from "./actions";

export default async function AdminJobsPage() {
  await requireAdminUser();
  const { data: jobs } = await getServiceRoleClient()
    .from("jobs")
    .select("id, type, status, attempts, max_attempts, last_error, created_at, finished_at")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <>
      <PageHeader eyebrow="Admin" title="Jobs" description="Últimos 100 jobs de la cola." />
      <DataTable
        rows={jobs ?? []}
        rowKey={(r) => r.id}
        columns={[
          { header: "Tipo", cell: (r) => r.type },
          { header: "Estado", cell: (r) => <StatusBadge value={r.status} /> },
          { header: "Intentos", cell: (r) => `${r.attempts}/${r.max_attempts}`, align: "right" },
          {
            header: "Error",
            cell: (r) => (
              <span className="line-clamp-2 max-w-xs text-xs text-stone">
                {r.last_error ?? "—"}
              </span>
            ),
          },
          { header: "Creado", cell: (r) => formatDate(r.created_at) },
          {
            header: "Acción",
            cell: (r) =>
              r.status === "FAILED" ? (
                <form action={retryJobAction}>
                  <input type="hidden" name="job_id" value={r.id} />
                  <button type="submit" className="text-sm text-clay underline underline-offset-4">
                    Reintentar
                  </button>
                </form>
              ) : null,
          },
        ]}
      />
    </>
  );
}
