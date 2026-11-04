import { NextResponse } from "next/server";
import {
  canAccessCell,
  getAllCellIds,
  getDashboardAccess,
} from "@/lib/supabase/dashboard-access";
import { writeAuditLog } from "@/lib/supabase/audit";
import { parseMemberInput } from "@/lib/members/validation";

function getPeriodStart(period: string | null) {
  const now = new Date();
  if (period === "30d") {
    now.setDate(now.getDate() - 30);
  } else if (period === "90d") {
    now.setDate(now.getDate() - 90);
  } else if (period === "year") {
    now.setMonth(0, 1);
    now.setHours(0, 0, 0, 0);
  } else {
    return null;
  }

  return now.toISOString();
}

export async function GET(request: Request) {
  const result = await getDashboardAccess();
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  const { access } = result;
  const cellScope = await getAllCellIds(access);
  if ("error" in cellScope) {
    return NextResponse.json({ error: cellScope.error }, { status: 500 });
  }

  const url = new URL(request.url);
  const search = (url.searchParams.get("q") ?? "")
    .replace(/[^\p{L}\p{N}@._+\-\s]/gu, " ")
    .trim()
    .slice(0, 100);
  const networkId = url.searchParams.get("networkId");
  const requestedCellId = url.searchParams.get("cellId");
  const status = url.searchParams.get("status");
  const periodStart = getPeriodStart(url.searchParams.get("period"));
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = 10;

  const allowedCells = cellScope.cellIds;
  let catalogCellQuery = access.adminClient
    .from("cells")
    .select("id, name, network_id, leader_id, is_active")
    .order("name", { ascending: true });

  if (allowedCells.length > 0) {
    catalogCellQuery = catalogCellQuery.in("id", allowedCells);
  } else {
    catalogCellQuery = catalogCellQuery.eq(
      "id",
      "00000000-0000-0000-0000-000000000000"
    );
  }

  const { data: cells, error: cellsError } = await catalogCellQuery;
  if (cellsError) {
    console.error("Erro ao carregar células para membros:", cellsError);
    return NextResponse.json(
      { error: "Não foi possível carregar as células." },
      { status: 500 }
    );
  }

  const cellIds = cells.map((cell) => cell.id);
  const networkIds = [...new Set(cells.map((cell) => cell.network_id))];
  const leaderIds = [
    ...new Set(cells.map((cell) => cell.leader_id).filter(Boolean)),
  ];

  const [networkResult, leadersResult] = await Promise.all([
    networkIds.length
      ? access.adminClient
          .from("networks")
          .select("id, name")
          .in("id", networkIds)
      : Promise.resolve({ data: [], error: null }),
    leaderIds.length
      ? access.adminClient
          .from("profiles")
          .select("id, full_name")
          .in("id", leaderIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (networkResult.error || leadersResult.error) {
    console.error(
      "Erro ao carregar dados relacionados dos membros:",
      networkResult.error ?? leadersResult.error
    );
    return NextResponse.json(
      { error: "Não foi possível carregar as opções de rede e liderança." },
      { status: 500 }
    );
  }

  const networks = networkResult.data ?? [];
  const leaders = leadersResult.data ?? [];
  const networkById = new Map(networks.map((network) => [network.id, network]));
  const leaderById = new Map(leaders.map((leader) => [leader.id, leader]));
  const cellById = new Map(cells.map((cell) => [cell.id, cell]));

  const visibleNetworkIds = networks.map((network) => network.id);
  const effectiveCellIds = networkId
    ? visibleNetworkIds.includes(networkId)
      ? cells
          .filter((cell) => cell.network_id === networkId)
          .map((cell) => cell.id)
      : []
    : cellIds;
  const filteredCellIds = requestedCellId
    ? effectiveCellIds.includes(requestedCellId)
      ? [requestedCellId]
      : []
    : effectiveCellIds;

  const baseCountQuery = (options?: { active?: boolean; since?: string }) => {
    let query = access.adminClient
      .from("members")
      .select("id", { count: "exact", head: true });
    if (options?.active !== undefined) {
      query = query.eq("is_active", options.active);
    }
    if (options?.since) {
      query = query.gte("created_at", options.since);
    }
    return query;
  };

  const countQueries =
    await Promise.all([
      baseCountQuery(),
      baseCountQuery({ active: true }),
      baseCountQuery({ active: false }),
      baseCountQuery({
        since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    ]);

  if (countQueries.some((count) => count.error)) {
    const error = countQueries.find((count) => count.error)?.error;
    console.error("Erro ao calcular indicadores de membros:", error);
    return NextResponse.json(
      { error: "Não foi possível calcular os indicadores de membros." },
      { status: 500 }
    );
  }

  if ((networkId || requestedCellId) && filteredCellIds.length === 0) {
    return NextResponse.json({
      members: [],
      networks,
      cells: await Promise.all(cells.map(async (cell) => ({
        id: cell.id,
        name: cell.name,
        networkId: cell.network_id,
        isActive: cell.is_active,
        canManage: await canAccessCell(access, cell.id),
      }))),
      stats: {
        total: countQueries[0]?.count ?? 0,
        active: countQueries[1]?.count ?? 0,
        inactive: countQueries[2]?.count ?? 0,
        newMembers: countQueries[3]?.count ?? 0,
      },
      page,
      pageSize,
      totalPages: 0,
      totalResults: 0,
    });
  }

  let query = access.adminClient
    .from("members")
    .select(
      "id, full_name, email, phone, birth_date, marital_status, cell_id, is_active, created_at, updated_at",
      { count: "exact" }
    )
    .order("full_name", { ascending: true })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (networkId || requestedCellId) {
    query = query.in("cell_id", filteredCellIds);
  }
  if (status === "active") {
    query = query.eq("is_active", true);
  } else if (status === "inactive") {
    query = query.eq("is_active", false);
  }
  if (periodStart) {
    query = query.gte("created_at", periodStart);
  }
  if (search) {
    const pattern = `%${search}%`;
    query = query.or(
      `full_name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern}`
    );
  }

  const { data: members, error: membersError, count } = await query;
  if (membersError) {
    console.error("Erro ao consultar membros:", membersError);
    return NextResponse.json(
      { error: "Não foi possível carregar os membros." },
      { status: 500 }
    );
  }

  const memberRows = await Promise.all((members ?? []).map(async (member) => {
    const cell = member.cell_id ? cellById.get(member.cell_id) : undefined;
    const network = cell ? networkById.get(cell.network_id) : undefined;
    const leader = cell?.leader_id
      ? leaderById.get(cell.leader_id)
      : undefined;
    return {
      id: member.id,
      fullName: member.full_name,
      email: member.email,
      phone: member.phone,
      birthDate: member.birth_date,
      maritalStatus: member.marital_status,
      cellId: member.cell_id,
      cellName: cell?.name ?? null,
      networkId: network?.id ?? null,
      networkName: network?.name ?? null,
      leaderName: leader?.full_name ?? null,
      isActive: member.is_active,
      createdAt: member.created_at,
      updatedAt: member.updated_at,
      canEdit: await canAccessCell(access, member.cell_id),
    };
  }));

  return NextResponse.json({
    members: memberRows,
    networks,
    cells: await Promise.all(cells.map(async (cell) => ({
      id: cell.id,
      name: cell.name,
      networkId: cell.network_id,
      isActive: cell.is_active,
      canManage: await canAccessCell(access, cell.id),
    }))),
    stats: {
      total: countQueries[0]?.count ?? 0,
      active: countQueries[1]?.count ?? 0,
      inactive: countQueries[2]?.count ?? 0,
      newMembers: countQueries[3]?.count ?? 0,
    },
    page,
    pageSize,
    totalPages: Math.ceil((count ?? 0) / pageSize),
    totalResults: count ?? 0,
  });
}

export async function POST(request: Request) {
  const result = await getDashboardAccess();
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
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

  const parsed = parseMemberInput(body);
  if (typeof parsed === "string") {
    return NextResponse.json({ error: parsed }, { status: 400 });
  }

  const { access } = result;
  let cellId = parsed.cellId;
  if (access.role === "leader" && !cellId && access.cellIds.length === 1) {
    cellId = access.cellIds[0];
  }

  if (access.role !== "admin" && !cellId) {
    return NextResponse.json(
      { error: "Selecione uma célula autorizada para cadastrar o membro." },
      { status: 400 }
    );
  }

  if (!(await canAccessCell(access, cellId))) {
    return NextResponse.json(
      { error: "Você não tem permissão para cadastrar membros nesta célula." },
      { status: 403 }
    );
  }

  const { data: member, error } = await access.adminClient
    .from("members")
    .insert({
      full_name: parsed.fullName,
      email: parsed.email,
      phone: parsed.phone,
      birth_date: parsed.birthDate,
      marital_status: parsed.maritalStatus,
      cell_id: cellId,
      is_active: parsed.isActive,
    })
    .select(
      "id, full_name, email, phone, birth_date, marital_status, cell_id, is_active, created_at, updated_at"
    )
    .single();

  if (error || !member) {
    console.error("Erro ao cadastrar membro:", error);
    return NextResponse.json(
      { error: "Não foi possível cadastrar o membro." },
      { status: 500 }
    );
  }

  const status = parsed.isActive ? "active" : "inactive";
  const [{ error: historyError }, auditRecorded] = await Promise.all([
    access.adminClient.from("member_status_history").insert({
      member_id: member.id,
      previous_status: null,
      new_status: status,
      changed_by: access.userId,
      reason: "Cadastro do membro",
      created_at: new Date().toISOString(),
    }),
    writeAuditLog(access, {
      action: "member.created",
      entityType: "member",
      entityId: member.id,
      description: `Membro ${parsed.fullName} cadastrado.`,
      metadata: { isActive: parsed.isActive, cellId },
    }),
  ]);

  const warnings: string[] = [];
  if (historyError) {
    console.error("Erro ao registrar situação inicial do membro:", historyError);
    warnings.push("O membro foi salvo, mas o histórico de situação falhou.");
  }
  if (!auditRecorded) {
    warnings.push("O membro foi salvo, mas o registro de auditoria falhou.");
  }

  return NextResponse.json(
    {
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
      },
      warning: warnings.join(" "),
    },
    { status: 201 }
  );
}
