import { NextResponse } from "next/server";
import {
  getAccessibleCellIds,
  getDashboardAccess,
} from "@/lib/supabase/dashboard-access";
import { writeAuditLog } from "@/lib/supabase/audit";

type CellInput = {
  name: string;
  networkId: string;
  leaderId: string | null;
  isActive: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseCellInput(value: unknown): CellInput | string {
  if (!isRecord(value)) {
    return "Os dados enviados são inválidos.";
  }

  const name = typeof value.name === "string" ? value.name.trim() : "";
  const networkId =
    typeof value.networkId === "string" ? value.networkId.trim() : "";
  const leaderId =
    typeof value.leaderId === "string" && value.leaderId.trim()
      ? value.leaderId.trim()
      : null;
  const isActive = value.isActive === undefined ? true : value.isActive;

  if (!name || name.length > 120) {
    return "Informe o nome da célula (até 120 caracteres).";
  }
  if (!networkId) {
    return "Selecione uma rede para a célula.";
  }
  if (typeof isActive !== "boolean") {
    return "A situação da célula é inválida.";
  }

  return { name, networkId, leaderId, isActive };
}

function accessFailure(
  result: Extract<Awaited<ReturnType<typeof getDashboardAccess>>, { ok: false }>
) {
  return NextResponse.json({ error: result.error }, { status: result.status });
}

async function validateCellAssignments(
  access: NonNullable<
    Extract<Awaited<ReturnType<typeof getDashboardAccess>>, { ok: true }>["access"]
  >,
  input: CellInput
) {
  if (
    access.role === "supervisor" &&
    !access.networkIds.includes(input.networkId)
  ) {
    return { error: "Você não pode gerenciar células desta rede.", status: 403 };
  }

  const { data: network, error: networkError } = await access.adminClient
    .from("networks")
    .select("id")
    .eq("id", input.networkId)
    .maybeSingle();

  if (networkError) {
    console.error("Erro ao validar rede da célula:", networkError);
    return { error: "Não foi possível validar a rede selecionada.", status: 500 };
  }
  if (!network) {
    return { error: "A rede selecionada não existe.", status: 400 };
  }

  if (input.leaderId) {
    const { data: leader, error: leaderError } = await access.adminClient
      .from("profiles")
      .select("id")
      .eq("id", input.leaderId)
      .eq("role", "leader")
      .eq("is_active", true)
      .maybeSingle();

    if (leaderError) {
      console.error("Erro ao validar líder da célula:", leaderError);
      return { error: "Não foi possível validar o líder selecionado.", status: 500 };
    }
    if (!leader) {
      return { error: "Selecione um líder ativo.", status: 400 };
    }
  }

  return { error: null, status: 200 };
}

export async function GET(request: Request) {
  const result = await getDashboardAccess();
  if (!result.ok) {
    return accessFailure(result);
  }
  const { access } = result;
  const scope = await getAccessibleCellIds(access);
  if ("error" in scope) {
    return NextResponse.json({ error: scope.error }, { status: 500 });
  }

  const params = new URL(request.url).searchParams;
  const requestedId = params.get("id");
  const search = (params.get("q") ?? "").trim().slice(0, 100);
  const networkId = params.get("networkId");
  const leaderId = params.get("leaderId");
  const status = params.get("status");

  let baseQuery = access.adminClient
    .from("cells")
    .select("id, name, network_id, leader_id, is_active, created_at")
    .order("name", { ascending: true });

  if (access.role !== "admin") {
    baseQuery = baseQuery.in(
      "id",
      scope.cellIds.length
        ? scope.cellIds
        : ["00000000-0000-0000-0000-000000000000"]
    );
  }

  const { data: allCells, error: cellsError } = await baseQuery;
  if (cellsError) {
    console.error("Erro ao carregar células:", cellsError);
    return NextResponse.json(
      { error: "Não foi possível carregar as células." },
      { status: 500 }
    );
  }

  const visibleNetworkIds = [...new Set(allCells.map((cell) => cell.network_id))];
  const leaderIds = [
    ...new Set(allCells.map((cell) => cell.leader_id).filter(Boolean)),
  ];
  let networkQuery = access.adminClient
    .from("networks")
    .select("id, name")
    .order("name", { ascending: true });
  if (access.role === "supervisor") {
    networkQuery =
      access.networkIds.length > 0
        ? networkQuery.in("id", access.networkIds)
        : networkQuery.eq("id", "00000000-0000-0000-0000-000000000000");
  } else if (access.role === "leader") {
    networkQuery =
      visibleNetworkIds.length > 0
        ? networkQuery.in("id", visibleNetworkIds)
        : networkQuery.eq("id", "00000000-0000-0000-0000-000000000000");
  }

  let leaderQuery = access.adminClient
    .from("profiles")
    .select("id, full_name")
    .eq("role", "leader")
    .eq("is_active", true)
    .order("full_name", { ascending: true });
  if (access.role !== "admin") {
    leaderQuery =
      leaderIds.length > 0
        ? leaderQuery.in("id", leaderIds)
        : leaderQuery.eq("id", "00000000-0000-0000-0000-000000000000");
  }

  const [networkResult, leaderResult, memberResult, currentLeadersResult] =
    await Promise.all([
      networkQuery,
      leaderQuery,
      allCells.length
        ? access.adminClient
            .from("members")
            .select("id, full_name, email, phone, cell_id, is_active")
            .in(
              "cell_id",
              requestedId && allCells.some((cell) => cell.id === requestedId)
                ? [requestedId]
                : allCells.map((cell) => cell.id)
            )
            .order("full_name", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      leaderIds.length
        ? access.adminClient
            .from("profiles")
            .select("id, full_name")
            .in("id", leaderIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

  const relatedError =
    networkResult.error ??
    leaderResult.error ??
    memberResult.error ??
    currentLeadersResult.error;
  if (relatedError) {
    console.error("Erro ao carregar dados relacionados das células:", relatedError);
    return NextResponse.json(
      { error: "Não foi possível carregar os dados das células." },
      { status: 500 }
    );
  }

  const networkById = new Map(
    (networkResult.data ?? []).map((network) => [network.id, network.name])
  );
  const leaders = leaderResult.data ?? [];
  const leaderById = new Map(
    [...(currentLeadersResult.data ?? []), ...leaders].map((leader) => [
      leader.id,
      leader.full_name,
    ])
  );
  const membersByCell = new Map<
    string,
    Array<{
      id: string;
      fullName: string;
      email: string | null;
      phone: string | null;
      isActive: boolean;
    }>
  >();

  for (const member of memberResult.data ?? []) {
    if (!member.cell_id) {
      continue;
    }
    const cellMembers = membersByCell.get(member.cell_id) ?? [];
    cellMembers.push({
      id: member.id,
      fullName: member.full_name,
      email: member.email,
      phone: member.phone,
      isActive: member.is_active,
    });
    membersByCell.set(member.cell_id, cellMembers);
  }

  const mappedCells = allCells.map((cell) => ({
    id: cell.id,
    name: cell.name,
    networkId: cell.network_id,
    networkName: networkById.get(cell.network_id) ?? "Rede",
    leaderId: cell.leader_id,
    leaderName: cell.leader_id
      ? leaderById.get(cell.leader_id) ?? "Líder não encontrado"
      : null,
    isActive: cell.is_active,
    createdAt: cell.created_at,
    memberCount: membersByCell.get(cell.id)?.length ?? 0,
    members: membersByCell.get(cell.id) ?? [],
  }));

  if (requestedId) {
    const cell = mappedCells.find((item) => item.id === requestedId);
    if (!cell) {
      return NextResponse.json(
        { error: "Célula não encontrada ou sem permissão de acesso." },
        { status: 404 }
      );
    }
    return NextResponse.json({ cell });
  }

  const filteredCells = mappedCells.filter((cell) => {
    const matchesSearch =
      !search ||
      cell.name.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"));
    const matchesNetwork = !networkId || cell.networkId === networkId;
    const matchesLeader = !leaderId || cell.leaderId === leaderId;
    const matchesStatus =
      !status || (status === "active" ? cell.isActive : !cell.isActive);
    return matchesSearch && matchesNetwork && matchesLeader && matchesStatus;
  });

  return NextResponse.json({
    cells: filteredCells,
    networks: networkResult.data ?? [],
    leaders,
    stats: {
      total: mappedCells.length,
      active: mappedCells.filter((cell) => cell.isActive).length,
      inactive: mappedCells.filter((cell) => !cell.isActive).length,
      leaders: new Set(mappedCells.map((cell) => cell.leaderId).filter(Boolean))
        .size,
    },
  });
}

export async function POST(request: Request) {
  const result = await getDashboardAccess();
  if (!result.ok) {
    return accessFailure(result);
  }
  const { access } = result;
  if (access.role === "leader") {
    return NextResponse.json(
      { error: "Líderes não podem cadastrar células." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Envie os dados da célula em formato JSON válido." },
      { status: 400 }
    );
  }

  const input = parseCellInput(body);
  if (typeof input === "string") {
    return NextResponse.json({ error: input }, { status: 400 });
  }

  const validation = await validateCellAssignments(access, input);
  if (validation.error) {
    return NextResponse.json(
      { error: validation.error },
      { status: validation.status }
    );
  }

  const { data: cell, error } = await access.adminClient
    .from("cells")
    .insert({
      name: input.name,
      network_id: input.networkId,
      leader_id: input.leaderId,
      is_active: input.isActive,
    })
    .select("id, name, network_id, leader_id, is_active, created_at")
    .single();

  if (error || !cell) {
    console.error("Erro ao cadastrar célula:", error);
    return NextResponse.json(
      { error: "Não foi possível cadastrar a célula." },
      { status: 500 }
    );
  }

  const auditRecorded = await writeAuditLog(access, {
    action: "cell.created",
    entityType: "cell",
    entityId: cell.id,
    description: `Célula ${cell.name} cadastrada.`,
    metadata: {
      networkId: cell.network_id,
      leaderId: cell.leader_id,
      isActive: cell.is_active,
    },
  });

  return NextResponse.json(
    {
      cell: {
        id: cell.id,
        name: cell.name,
        networkId: cell.network_id,
        leaderId: cell.leader_id,
        isActive: cell.is_active,
        createdAt: cell.created_at,
      },
      warning: auditRecorded
        ? ""
        : "A célula foi salva, mas o registro de auditoria falhou.",
    },
    { status: 201 }
  );
}

export async function PATCH(request: Request) {
  const result = await getDashboardAccess();
  if (!result.ok) {
    return accessFailure(result);
  }
  const { access } = result;
  if (access.role === "leader") {
    return NextResponse.json(
      { error: "Líderes não podem editar células." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Envie os dados da célula em formato JSON válido." },
      { status: 400 }
    );
  }
  if (!isRecord(body) || typeof body.id !== "string" || !body.id.trim()) {
    return NextResponse.json(
      { error: "Informe a célula que deseja editar." },
      { status: 400 }
    );
  }

  const input = parseCellInput(body);
  if (typeof input === "string") {
    return NextResponse.json({ error: input }, { status: 400 });
  }
  const scope = await getAccessibleCellIds(access);
  if ("error" in scope) {
    return NextResponse.json({ error: scope.error }, { status: 500 });
  }
  if (
    access.role !== "admin" &&
    (!scope.cellIds.includes(body.id) ||
      !access.networkIds.includes(input.networkId))
  ) {
    return NextResponse.json(
      { error: "Você não pode editar células fora das suas redes." },
      { status: 403 }
    );
  }

  const { data: current, error: currentError } = await access.adminClient
    .from("cells")
    .select("id, name, network_id, leader_id, is_active")
    .eq("id", body.id)
    .maybeSingle();

  if (currentError) {
    console.error("Erro ao consultar célula para edição:", currentError);
    return NextResponse.json(
      { error: "Não foi possível carregar a célula para edição." },
      { status: 500 }
    );
  }
  if (!current) {
    return NextResponse.json(
      { error: "Célula não encontrada." },
      { status: 404 }
    );
  }

  const validation = await validateCellAssignments(access, input);
  if (validation.error) {
    return NextResponse.json(
      { error: validation.error },
      { status: validation.status }
    );
  }

  const { data: updated, error: updateError } = await access.adminClient
    .from("cells")
    .update({
      name: input.name,
      network_id: input.networkId,
      leader_id: input.leaderId,
      is_active: input.isActive,
    })
    .eq("id", current.id)
    .select("id, name, network_id, leader_id, is_active, created_at")
    .single();

  if (updateError || !updated) {
    console.error("Erro ao atualizar célula:", updateError);
    return NextResponse.json(
      { error: "Não foi possível atualizar a célula." },
      { status: 500 }
    );
  }

  let historyWarning = "";
  if (current.leader_id !== updated.leader_id) {
    const { error: historyError } = await access.adminClient
      .from("cell_leader_history")
      .insert({
        cell_id: updated.id,
        previous_leader_id: current.leader_id,
        new_leader_id: updated.leader_id,
        changed_by: access.userId,
        reason: "Alteração pela gestão de células",
        created_at: new Date().toISOString(),
      });
    if (historyError) {
      console.error("Erro ao registrar histórico de liderança:", historyError);
      historyWarning = "O líder foi alterado, mas o histórico não foi salvo.";
    }
  }

  const auditRecorded = await writeAuditLog(access, {
    action:
      current.is_active !== updated.is_active
        ? "cell.status_changed"
        : "cell.updated",
    entityType: "cell",
    entityId: updated.id,
    description: `Célula ${updated.name} atualizada.`,
    metadata: {
      previousLeaderId: current.leader_id,
      leaderId: updated.leader_id,
      previousNetworkId: current.network_id,
      networkId: updated.network_id,
      previousStatus: current.is_active,
      isActive: updated.is_active,
    },
  });

  return NextResponse.json({
    cell: {
      id: updated.id,
      name: updated.name,
      networkId: updated.network_id,
      leaderId: updated.leader_id,
      isActive: updated.is_active,
      createdAt: updated.created_at,
    },
    warning: [
      historyWarning,
      !auditRecorded && "A célula foi atualizada, mas a auditoria falhou.",
    ]
      .filter(Boolean)
      .join(" "),
  });
}
