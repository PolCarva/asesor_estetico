import { getServiceRoleClient } from "@asesor/db/service";

import { DataTable, formatDate } from "@/components/admin/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdminUser } from "@/lib/auth";

export default async function AdminAIUsagePage() {
  await requireAdminUser();
  const { data: rows } = await getServiceRoleClient()
    .from("ai_usage")
    .select(
      "id, operation, provider, model, input_tokens, output_tokens, image_count, estimated_cost_usd, duration_ms, success, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <>
      <PageHeader eyebrow="Admin" title="AI Usage" description="Últimas 100 operaciones de IA." />
      <DataTable
        rows={rows ?? []}
        rowKey={(r) => r.id}
        columns={[
          { header: "Operación", cell: (r) => r.operation },
          { header: "Proveedor / modelo", cell: (r) => `${r.provider} · ${r.model}` },
          {
            header: "Tokens in/out",
            cell: (r) => `${r.input_tokens} / ${r.output_tokens}`,
            align: "right",
          },
          { header: "Imágenes", cell: (r) => r.image_count, align: "right" },
          { header: "Costo USD", cell: (r) => r.estimated_cost_usd.toFixed(4), align: "right" },
          { header: "ms", cell: (r) => r.duration_ms, align: "right" },
          { header: "OK", cell: (r) => (r.success ? "Sí" : "No") },
          { header: "Fecha", cell: (r) => formatDate(r.created_at) },
        ]}
      />
    </>
  );
}
