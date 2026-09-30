import { getServiceRoleClient } from "@asesor/db/service";
import { z } from "zod";

import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdminUser } from "@/lib/auth";

const MetricsSchema = z.object({
  total_users: z.number(),
  premium_users: z.number(),
  free_users: z.number(),
  jobs_pending: z.number(),
  jobs_failed: z.number(),
  ai_cost_usd: z.number(),
  ai_cost_usd_30d: z.number(),
  analysis_completed: z.number(),
  checkout_started: z.number(),
  subscription_started: z.number(),
});

export default async function AdminOverviewPage() {
  await requireAdminUser();
  const { data, error } = await getServiceRoleClient().rpc("admin_overview_metrics");
  if (error) throw new Error("No se pudieron cargar las métricas.");
  const m = MetricsSchema.parse(data);
  const conversion =
    m.checkout_started > 0 ? (m.subscription_started / m.checkout_started) * 100 : 0;

  const cards = [
    ["Total users", m.total_users.toLocaleString("es-UY")],
    ["Free", m.free_users.toLocaleString("es-UY")],
    ["Premium", m.premium_users.toLocaleString("es-UY")],
    ["Jobs pending", m.jobs_pending.toLocaleString("es-UY")],
    ["Jobs failed", m.jobs_failed.toLocaleString("es-UY")],
    ["AI cost (total)", `USD ${m.ai_cost_usd.toFixed(2)}`],
    ["AI cost (30 d)", `USD ${m.ai_cost_usd_30d.toFixed(2)}`],
    ["Analysis completed", m.analysis_completed.toLocaleString("es-UY")],
    ["Checkout conversion", `${conversion.toFixed(1)} %`],
  ] as const;

  return (
    <>
      <PageHeader eyebrow="Admin" title="Overview" />
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(([label, value]) => (
          <Card key={label}>
            <dt className="eyebrow">{label}</dt>
            <dd className="mt-3 font-display text-4xl">{value}</dd>
          </Card>
        ))}
      </dl>
      <p className="mt-6 text-xs text-stone">
        Checkout conversion = usuarios con subscription_started / usuarios con checkout_started.
      </p>
    </>
  );
}
