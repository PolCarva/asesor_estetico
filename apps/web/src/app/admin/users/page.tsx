import { getServiceRoleClient } from "@asesor/db/service";

import { DataTable, formatDate } from "@/components/admin/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdminUser } from "@/lib/auth";

export default async function AdminUsersPage() {
  await requireAdminUser();
  const db = getServiceRoleClient();
  const [{ data: profiles }, { data: authUsers }] = await Promise.all([
    db
      .from("profiles")
      .select("id, display_name, role, onboarding_completed, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    db.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  const emails = new Map(authUsers.users.map((u) => [u.id, u.email ?? "—"]));

  return (
    <>
      <PageHeader eyebrow="Admin" title="Users" description="Últimos 100 usuarios." />
      <DataTable
        rows={profiles ?? []}
        rowKey={(r) => r.id}
        columns={[
          { header: "Email", cell: (r) => emails.get(r.id) ?? "—" },
          { header: "Nombre", cell: (r) => r.display_name ?? "—" },
          { header: "Rol", cell: (r) => r.role },
          {
            header: "Onboarding",
            cell: (r) => (r.onboarding_completed ? "Completo" : "Pendiente"),
          },
          { header: "Alta", cell: (r) => formatDate(r.created_at) },
        ]}
      />
    </>
  );
}
