"use server";

import { retryJob } from "@asesor/db";
import { getServiceRoleClient } from "@asesor/db/service";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdminUser } from "@/lib/auth";

export async function retryJobAction(formData: FormData) {
  await requireAdminUser();
  const jobId = z.uuid().parse(formData.get("job_id"));
  await retryJob(getServiceRoleClient(), jobId);
  revalidatePath("/admin/jobs");
}
