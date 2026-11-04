import "server-only";

import type { DashboardAccess } from "@/lib/supabase/dashboard-access";

export async function writeAuditLog(
  access: DashboardAccess,
  input: {
    action: string;
    entityType: string;
    entityId: string;
    description: string;
    metadata?: Record<string, unknown>;
  }
) {
  const { error } = await access.adminClient.from("audit_logs").insert({
    profile_id: access.userId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    description: input.description,
    metadata: input.metadata ?? {},
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error("Erro ao registrar auditoria:", error);
    return false;
  }

  return true;
}
