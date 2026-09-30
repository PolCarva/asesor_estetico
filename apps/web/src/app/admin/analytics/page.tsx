import { getServiceRoleClient } from "@asesor/db/service";

import { DataTable } from "@/components/admin/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdminUser } from "@/lib/auth";

export default async function AdminAnalyticsPage() {
  await requireAdminUser();
  const { data: counts } = await getServiceRoleClient().rpc("admin_event_counts", { p_days: 30 });

  return (
    <>
      <PageHeader eyebrow="Admin" title="Analytics" description="Eventos de los últimos 30 días." />
      <DataTable
        rows={counts ?? []}
        rowKey={(r) => r.name}
        columns={[
          { header: "Evento", cell: (r) => <code className="text-xs">{r.name}</code> },
          { header: "Total", cell: (r) => r.total.toLocaleString("es-UY"), align: "right" },
          {
            header: "Usuarios únicos",
            cell: (r) => r.unique_users.toLocaleString("es-UY"),
            align: "right",
          },
        ]}
      />
    </>
  );
}
