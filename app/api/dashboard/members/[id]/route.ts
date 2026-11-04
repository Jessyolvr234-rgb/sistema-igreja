import { NextResponse } from "next/server";
import {
  canAccessCell,
  getDashboardAccess,
} from "@/lib/supabase/dashboard-access";
import { writeAuditLog } from "@/lib/supabase/audit";
import { isRecord, parseMemberInput } from "@/lib/members/validation";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const result = await getDashboardAccess();
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  const { id } = await params;
  const { access } = result;
  const { data: member, error: memberError } = await access.adminClient
    .from("members")
    .select(
      "id, full_name, email, phone, birth_date, marital_status, cell_id, is_active, created_at, updated_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (memberError) {
    console.error("Erro ao consultar membro:", memberError);
    return NextResponse.json(
      { error: "Não foi possível carregar o membro." },
      { status: 500 }
    );
  }

  if (!member) {
    return NextResponse.json(
      { error: "Membro não encontrado." },
      { status: 404 }
    );
  }

  const { data: history, error: historyError } = await access.adminClient
    .from("member_status_history")
    .select("id, previous_status, new_status, reason, changed_by, created_at")
    .eq("member_id", id)
    .order("created_at", { ascending: false });

  if (historyError) {
    console.error("Erro ao carregar histórico do membro:", historyError);
    return NextResponse.json(
      { error: "Não foi possível carregar o histórico do membro." },
      { status: 500 }
    );
  }

  const changerIds = [
    ...new Set((history ?? []).map((entry) => entry.changed_by)),
  ];
  const { data: changers, error: changersError } = changerIds.length
    ? await access.adminClient
        .from("profiles")
        .select("id, full_name")
        .in("id", changerIds)
    : { data: [], error: null };

  if (changersError) {
    console.error("Erro ao consultar responsáveis pelo histórico:", changersError);
    return NextResponse.json(
      { error: "Não foi possível carregar os responsáveis pelo histórico." },
      { status: 500 }
    );
  }

  const changerById = new Map(
    (changers ?? []).map((profile) => [profile.id, profile.full_name])
  );

  return NextResponse.json({
    member: {
      id: member.id,
      fullName: member.full_name,
      email: member.email,
      phone: member.phone,
      birthDate: member.birth_date,
      maritalStatus: member.marital_status,
      cellId: member.cell_id,
      isActive: member.is_active,
      createdAt: member.created_at,
      updatedAt: member.updated_at,
      canEdit: await canAccessCell(access, member.cell_id),
    },
    history: (history ?? []).map((entry) => ({
      id: entry.id,
      previousStatus: entry.previous_status,
      newStatus: entry.new_status,
      reason: entry.reason,
      changedBy: changerById.get(entry.changed_by) ?? "Usuário",
      createdAt: entry.created_at,
    })),
  });
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const result = await getDashboardAccess();
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  const { id } = await params;
  const { access } = result;
  const { data: current, error: currentError } = await access.adminClient
    .from("members")
    .select(
      "id, full_name, email, phone, birth_date, marital_status, cell_id, is_active"
    )
    .eq("id", id)
    .maybeSingle();

  if (currentError) {
    console.error("Erro ao consultar membro para edição:", currentError);
    return NextResponse.json(
      { error: "Não foi possível carregar o membro para edição." },
      { status: 500 }
    );
  }

  if (!current) {
    return NextResponse.json(
      { error: "Membro não encontrado." },
      { status: 404 }
    );
  }

  if (!(await canAccessCell(access, current.cell_id))) {
    return NextResponse.json(
      { error: "Você não tem permissão para editar este membro." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Envie os dados do membro em formato JSON válido." },
      { status: 400 }
    );
  }

  if (!isRecord(body)) {
    return NextResponse.json(
      { error: "Os dados enviados são inválidos." },
      { status: 400 }
    );
  }

  const parsed = parseMemberInput({
    ...body,
    isActive: body.isActive === undefined ? current.is_active : body.isActive,
    cellId: body.cellId === undefined ? current.cell_id : body.cellId,
  });

  if (typeof parsed === "string") {
    return NextResponse.json({ error: parsed }, { status: 400 });
  }

  if (!(await canAccessCell(access, parsed.cellId))) {
    return NextResponse.json(
      { error: "Você não pode mover o membro para esta célula." },
      { status: 403 }
    );
  }

  const { data: updated, error: updateError } = await access.adminClient
    .from("members")
    .update({
      full_name: parsed.fullName,
      email: parsed.email,
      phone: parsed.phone,
      birth_date: parsed.birthDate,
      marital_status: parsed.maritalStatus,
      cell_id: parsed.cellId,
      is_active: parsed.isActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(
      "id, full_name, email, phone, birth_date, marital_status, cell_id, is_active, created_at, updated_at"
    )
    .single();

  if (updateError || !updated) {
    console.error("Erro ao atualizar membro:", updateError);
    return NextResponse.json(
      { error: "Não foi possível atualizar o membro." },
      { status: 500 }
    );
  }

  const statusChanged = current.is_active !== updated.is_active;
  const auditPromise = writeAuditLog(access, {
    action: statusChanged ? "member.status_changed" : "member.updated",
    entityType: "member",
    entityId: updated.id,
    description: statusChanged
      ? `Situação de ${updated.full_name} alterada.`
      : `Dados de ${updated.full_name} atualizados.`,
    metadata: {
      previousStatus: current.is_active ? "active" : "inactive",
      newStatus: updated.is_active ? "active" : "inactive",
      cellId: updated.cell_id,
    },
  });

  let auditRecorded: boolean;
  let historyError: { message: string } | null = null;
  if (statusChanged) {
    const [auditResult, historyResult] = await Promise.all([
      auditPromise,
      access.adminClient.from("member_status_history").insert({
        member_id: updated.id,
        previous_status: current.is_active ? "active" : "inactive",
        new_status: updated.is_active ? "active" : "inactive",
        changed_by: access.userId,
        reason: "Alteração pela gestão de membros",
        created_at: new Date().toISOString(),
      }),
    ]);
    auditRecorded = auditResult;
    historyError = historyResult.error;
  } else {
    auditRecorded = await auditPromise;
  }

  const warnings: string[] = [];
  if (!auditRecorded) {
    warnings.push("Os dados foram salvos, mas o registro de auditoria falhou.");
  }

  if (historyError) {
    console.error("Erro ao registrar alteração de situação:", historyError);
    warnings.push("A situação foi alterada, mas o histórico não foi salvo.");
  }

  return NextResponse.json({
    member: {
      id: updated.id,
      fullName: updated.full_name,
      email: updated.email,
      phone: updated.phone,
      birthDate: updated.birth_date,
      maritalStatus: updated.marital_status,
      cellId: updated.cell_id,
      isActive: updated.is_active,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    },
    warning: warnings.join(" "),
  });
}
