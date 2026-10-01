import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { getPipelineState } from "@/lib/pipeline";

/**
 * El diseño no tiene "Inicio": la entrada a la app lleva al paso que corresponde.
 * Con análisis hecho, a los looks; si no, a las fotos o al análisis.
 */
export default async function DashboardPage() {
  const user = await requireUser("/app/dashboard");
  const pipeline = await getPipelineState(user.id);
  if (pipeline.hasProfile && !pipeline.busy) redirect("/app/looks");
  if (pipeline.stage === "NEEDS_PHOTOS") redirect("/app/onboarding/photos");
  redirect("/app/onboarding");
}
