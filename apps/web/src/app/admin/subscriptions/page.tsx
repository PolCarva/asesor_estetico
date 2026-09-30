import { getServiceRoleClient } from "@asesor/db/service";

import { DataTable, formatDate, StatusBadge } from "@/components/admin/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdminUser } from "@/lib/auth";

export default async function AdminSubscriptionsPage() {
  await requireAdminUser();
  const { data: subs } = await getServiceRoleClient()
    .from("subscriptions")
    .select("id, user_id, provider, status, price_amount, currency, current_period_end, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <>
      <PageHeader eyebrow="Admin" title="Subscriptions" description="Últimas 100 suscripciones." />
      <DataTable
        rows={subs ?? []}
        rowKey={(r) => r.id}
        columns={[
          {
            header: "Usuario",
            cell: (r) => <code className="text-xs">{r.user_id.slice(0, 8)}</code>,
          },
          { header: "Proveedor", cell: (r) => r.provider },
          { header: "Estado", cell: (r) => <StatusBadge value={r.status} /> },
          { header: "Precio", cell: (r) => `${r.currency} ${r.price_amount}`, align: "right" },
          { header: "Fin de período", cell: (r) => formatDate(r.current_period_end) },
          { header: "Alta", cell: (r) => formatDate(r.created_at) },
        ]}
      />
    </>
  );
}
