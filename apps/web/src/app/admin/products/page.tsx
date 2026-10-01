import { getServiceRoleClient } from "@asesor/db/service";

import { DataTable, formatDate, StatusBadge } from "@/components/admin/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdminUser } from "@/lib/auth";

export default async function AdminProductsPage() {
  await requireAdminUser();
  const { data: products } = await getServiceRoleClient()
    .from("products")
    .select(
      "id, title, store_name, category, price_amount, currency, availability, last_fetched_at",
    )
    .order("last_fetched_at", { ascending: false })
    .limit(100);

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Products"
        description="Catálogo normalizado (últimos 100 actualizados)."
      />
      <DataTable
        rows={products ?? []}
        rowKey={(r) => r.id}
        columns={[
          { header: "Producto", cell: (r) => r.title },
          { header: "Tienda", cell: (r) => r.store_name },
          { header: "Categoría", cell: (r) => r.category },
          {
            header: "Precio",
            // Sin precio solo puede estar un producto de local físico (IN_STORE_ONLY).
            cell: (r) =>
              r.price_amount === null
                ? "En el local"
                : `${r.currency} ${r.price_amount.toLocaleString("es-UY")}`,
            align: "right",
          },
          { header: "Stock", cell: (r) => <StatusBadge value={r.availability} /> },
          { header: "Actualizado", cell: (r) => formatDate(r.last_fetched_at) },
        ]}
      />
    </>
  );
}
