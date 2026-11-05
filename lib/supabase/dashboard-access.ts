import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type DashboardRole = "admin" | "supervisor" | "leader";

export type DashboardAccess = {
  userId: string;
  role: DashboardRole;
  cellIds: string[];
  adminClient: ReturnType<typeof createAdminClient>;
};

export function hasAdministrativeAccess(
  access: Pick<DashboardAccess, "role">
): boolean {
  return access.role === "admin" || access.role === "supervisor";
}

export type DashboardAccessResult =
  | { ok: true; access: DashboardAccess }
  | { ok: false; status: 401 | 403 | 500; error: string };

export async function getDashboardAccess(): Promise<DashboardAccessResult> {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims) {
    return {
      ok: false,
      status: 401,
      error: "Você precisa estar autenticado.",
    };
  }

  const userId = claimsData.claims.sub;
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    console.error("Erro ao consultar perfil do usuário:", profileError);
    return {
      ok: false,
      status: 500,
      error: "Não foi possível verificar seu perfil de acesso.",
    };
  }

  if (!profile || !profile.is_active) {
    return {
      ok: false,
      status: 403,
      error: "Seu perfil está inativo ou não possui autorização.",
    };
  }

  if (
    profile.role !== "admin" &&
    profile.role !== "supervisor" &&
    profile.role !== "leader"
  ) {
    return {
      ok: false,
      status: 403,
      error: "Seu perfil não tem permissão para acessar este recurso.",
    };
  }

  const adminClient = createAdminClient();
  let cellIds: string[] = [];

  if (profile.role === "leader") {
    const { data, error } = await adminClient
      .from("cells")
      .select("id")
      .eq("leader_id", userId);

    if (error) {
      console.error("Erro ao consultar células do líder:", error);
      return {
        ok: false,
        status: 500,
        error: "Não foi possível carregar as células autorizadas.",
      };
    }

    cellIds = data.map((cell) => cell.id);
  }

  return {
    ok: true,
    access: {
      userId,
      role: profile.role,
      cellIds,
      adminClient,
    },
  };
}

export async function getAccessibleCellIds(
  access: DashboardAccess
): Promise<{ cellIds: string[] } | { error: string }> {
  if (access.role === "leader") {
    return { cellIds: access.cellIds };
  }

  const { data, error } = await access.adminClient
    .from("cells")
    .select("id")
    .order("name", { ascending: true });

  if (error) {
    console.error("Erro ao consultar células:", error);
    return { error: "Não foi possível carregar as células." };
  }

  return { cellIds: data.map((cell) => cell.id) };
}

export async function getAllCellIds(
  access: DashboardAccess
): Promise<{ cellIds: string[] } | { error: string }> {
  const { data, error } = await access.adminClient
    .from("cells")
    .select("id")
    .order("name", { ascending: true });

  if (error) {
    console.error("Erro ao consultar células para visualização compartilhada:", error);
    return { error: "Não foi possível carregar as células." };
  }

  return { cellIds: data.map((cell) => cell.id) };
}

export async function canAccessCell(
  access: DashboardAccess,
  cellId: string | null
): Promise<boolean> {
  if (!cellId) {
    return hasAdministrativeAccess(access);
  }

  if (access.role !== "leader") {
    const { data, error } = await access.adminClient
      .from("cells")
      .select("id")
      .eq("id", cellId)
      .maybeSingle();

    if (error) {
      console.error("Erro ao validar célula:", error);
    }

    return !!data;
  }

  return access.cellIds.includes(cellId);
}
