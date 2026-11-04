import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/supabase/audit";
import {
  getDashboardAccess,
  type DashboardAccess,
} from "@/lib/supabase/dashboard-access";

type NetworkInput = {
  name: string;
  description: string | null;
  isActive: boolean;
  supervisorIds: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseNetworkInput(value: unknown): NetworkInput | string {
  if (!isRecord(value)) {
    return "Os dados enviados são inválidos.";
  }

  const name = typeof value.name === "string" ? value.name.trim() : "";
  const description =
    typeof value.description === "string" && value.description.trim()
      ? value.description.trim()
      : null;
  const supervisorIds = Array.isArray(value.supervisorIds)
    ? [
        ...new Set(
          value.supervisorIds
            .filter(
              (id): id is string => typeof id === "string" && !!id.trim()
            )
            .map((id) => id.trim())
        ),
      ]
    : typeof value.supervisorId === "string" && value.supervisorId.trim()
      ? [value.supervisorId.trim()]
      : [];
  const isActive = value.isActive === undefined ? true : value.isActive;

  if (!name || name.length > 120) {
    return "Informe o nome da rede (até 120 caracteres).";
  }
  if (description && description.length > 2000) {
    return "A descrição deve ter até 2.000 caracteres.";
  }
  if (typeof isActive !== "boolean") {
    return "A situação da rede é inválida.";
  }

  return { name, description, isActive, supervisorIds };
}

async function loadNetworkData(access: DashboardAccess, networkIds: string[]) {
  const { adminClient } = access;
  if (networkIds.length === 0) {
    return {
      networks: [],
      cells: [],
      supervisors: [],
      leaders: [],
      members: [],
      error: null,
    };
  }

  const [networkResult, assignmentResult] = await Promise.all([
    adminClient
      .from("networks")
      .select("id, name, description, is_active, created_at")
      .in("id", networkIds)
      .order("name", { ascending: true }),
    adminClient
      .from("supervisor_networks")
      .select("network_id, supervisor_id")
      .in("network_id", networkIds),
  ]);

  const cellQuery = adminClient
    .from("cells")
    .select("id, name, network_id, leader_id, is_active, created_at")
    .in("network_id", networkIds)
    .order("name", { ascending: true });

  const scopedCellResult = await cellQuery;

  const firstError =
    networkResult.error ?? scopedCellResult.error ?? assignmentResult.error;
  if (firstError) {
    return {
      networks: [],
      cells: [],
      supervisors: [],
      leaders: [],
      members: [],
      error: firstError,
    };
  }

  const cells = scopedCellResult.data ?? [];
  const cellIds = cells.map((cell) => cell.id);
  const profileIds = [
    ...new Set([
      ...(assignmentResult.data ?? []).map(
        (assignment) => assignment.supervisor_id
      ),
      ...cells.map((cell) => cell.leader_id).filter(Boolean),
    ]),
  ];

  const [profilesResult, membersResult] = await Promise.all([
    profileIds.length
      ? adminClient
          .from("profiles")
          .select("id, full_name, email")
          .in("id", profileIds)
      : Promise.resolve({ data: [], error: null }),
    cellIds.length
      ? adminClient
          .from("members")
          .select("cell_id")
          .in("cell_id", cellIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const relatedError = profilesResult.error ?? membersResult.error;
  if (relatedError) {
    return {
      networks: [],
      cells: [],
      supervisors: [],
      leaders: [],
      members: [],
      error: relatedError,
    };
  }

  const profiles = profilesResult.data ?? [];
  return {
    networks: networkResult.data ?? [],
    cells,
    supervisors: (assignmentResult.data ?? []).map((assignment) => ({
      networkId: assignment.network_id,
      profile: profiles.find(
        (profile) => profile.id === assignment.supervisor_id
      ),
    })),
    leaders: cells.map((cell) => ({
      cellId: cell.id,
      profile: profiles.find((profile) => profile.id === cell.leader_id),
    })),
    members: membersResult.data ?? [],
    error: null,
  };
}

function toNetworkView(
  network: {
    id: string;
    name: string;
    description: string | null;
    is_active: boolean;
    created_at: string;
  },
  data: Awaited<ReturnType<typeof loadNetworkData>>,
  access: DashboardAccess
) {
  const supervisors = data.supervisors.flatMap((entry) =>
    entry.networkId === network.id && entry.profile
      ? [
          {
            id: entry.profile.id,
            fullName: entry.profile.full_name,
            email: entry.profile.email,
          },
        ]
      : []
  );

  const cells = data.cells
    .filter((cell) => cell.network_id === network.id)
    .map((cell) => {
      const leader = data.leaders.find(
        (entry) => entry.cellId === cell.id
      )?.profile;
      const memberCount = data.members.filter(
        (member) => member.cell_id === cell.id
      ).length;

      return {
        id: cell.id,
        name: cell.name,
        leaderId: cell.leader_id,
        leaderName: leader?.full_name ?? null,
        isActive: cell.is_active,
        createdAt: cell.created_at,
        memberCount,
      };
    });

  return {
    id: network.id,
    canManage:
      access.role === "admin" ||
      (access.role === "supervisor" &&
        access.networkIds.includes(network.id)),
    name: network.name,
    description: network.description,
    isActive: network.is_active,
    createdAt: network.created_at,
    supervisors,
    cells,
    cellCount: cells.length,
    memberCount: cells.reduce((sum, cell) => sum + cell.memberCount, 0),
  };
}

async function validateSupervisors(
  access: DashboardAccess,
  supervisorIds: string[]
) {
  if (supervisorIds.length === 0) {
    return { valid: true, error: null };
  }

  const { data, error } = await access.adminClient
    .from("profiles")
    .select("id")
    .in("id", supervisorIds)
    .eq("role", "supervisor")
    .eq("is_active", true);

  if (error) {
    return { valid: false, error };
  }
  return { valid: data.length === supervisorIds.length, error: null };
}

function accessFailure(
  result: Extract<Awaited<ReturnType<typeof getDashboardAccess>>, { ok: false }>
) {
  return NextResponse.json(
    { error: result.error },
    { status: result.status }
  );
}

export async function GET(request: Request) {
  const result = await getDashboardAccess();
  if (!result.ok) {
    return accessFailure(result);
  }

  const { access } = result;
  const requestedId = new URL(request.url).searchParams.get("id");
  let networksQuery = access.adminClient.from("networks").select("id");
  if (requestedId) {
    networksQuery = networksQuery.eq("id", requestedId);
  }
  const { data: networkRows, error: networksError } = await networksQuery;
  if (networksError) {
    console.error("Erro ao consultar redes:", networksError);
    return NextResponse.json(
      { error: "Não foi possível carregar as redes." },
      { status: 500 }
    );
  }
  const networkIds = networkRows.map((network) => network.id);

  const data = await loadNetworkData(access, networkIds);
  if (data.error) {
    console.error("Erro ao carregar dados das redes:", data.error);
    return NextResponse.json(
      { error: "Não foi possível carregar os dados das redes." },
      { status: 500 }
    );
  }

  const networks = data.networks.map((network) =>
    toNetworkView(network, data, access)
  );
  if (requestedId && networks.length === 0) {
    return NextResponse.json(
      { error: "Rede não encontrada." },
      { status: 404 }
    );
  }

  const { data: activeSupervisors, error: supervisorsError } =
    access.role !== "leader" && !requestedId
      ? await access.adminClient
          .from("profiles")
          .select("id, full_name, email")
          .eq("role", "supervisor")
          .eq("is_active", true)
          .order("full_name", { ascending: true })
      : { data: [], error: null };

  if (supervisorsError) {
    console.error("Erro ao carregar supervisores:", supervisorsError);
    return NextResponse.json(
      { error: "Não foi possível carregar os supervisores." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    networks: requestedId ? undefined : networks,
    network: requestedId ? networks[0] : undefined,
    canManage: access.role !== "leader",
    supervisors: (activeSupervisors ?? []).map((profile) => ({
      id: profile.id,
      fullName: profile.full_name,
      email: profile.email,
    })),
    stats: {
      total: networks.length,
      active: networks.filter((network) => network.isActive).length,
      cells: networks.reduce((sum, network) => sum + network.cellCount, 0),
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
      { error: "Líderes não podem cadastrar redes." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Envie os dados da rede em formato JSON válido." },
      { status: 400 }
    );
  }

  const input = parseNetworkInput(body);
  if (typeof input === "string") {
    return NextResponse.json({ error: input }, { status: 400 });
  }

  const supervisorIds = [
    ...new Set([
      ...input.supervisorIds,
      ...(access.role === "supervisor" ? [access.userId] : []),
    ]),
  ];
  const supervisorValidation = await validateSupervisors(access, supervisorIds);
  if (supervisorValidation.error) {
    console.error(
      "Erro ao validar supervisores:",
      supervisorValidation.error
    );
    return NextResponse.json(
      { error: "Não foi possível validar os supervisores selecionados." },
      { status: 500 }
    );
  }
  if (!supervisorValidation.valid) {
    return NextResponse.json(
      { error: "Selecione apenas supervisores ativos." },
      { status: 400 }
    );
  }

  const { data: network, error: insertError } = await access.adminClient
    .from("networks")
    .insert({
      name: input.name,
      description: input.description,
      is_active: input.isActive,
    })
    .select("id, name, description, is_active, created_at")
    .single();

  if (insertError || !network) {
    console.error("Erro ao cadastrar rede:", insertError);
    return NextResponse.json(
      { error: "Não foi possível cadastrar a rede." },
      { status: 500 }
    );
  }

  let supervisorWarning = "";
  if (supervisorIds.length) {
    const { error } = await access.adminClient
      .from("supervisor_networks")
      .insert(
        supervisorIds.map((supervisorId) => ({
          supervisor_id: supervisorId,
          network_id: network.id,
          created_at: new Date().toISOString(),
        }))
      );
    if (error) {
      console.error("Erro ao vincular supervisores à rede:", error);
      supervisorWarning =
        "A rede foi criada, mas os supervisores não puderam ser vinculados.";
    }
  }

  const auditRecorded = await writeAuditLog(access, {
    action: "network.created",
    entityType: "network",
    entityId: network.id,
    description: `Rede ${network.name} cadastrada.`,
    metadata: {
      requestedSupervisorIds: supervisorIds,
      supervisorAssignmentsSucceeded: !supervisorWarning,
      isActive: input.isActive,
    },
  });
  const details = await loadNetworkData(access, [network.id]);
  if (details.error) {
    console.error("Erro ao recarregar rede recém-criada:", details.error);
  }
  const warning = [
    supervisorWarning,
    !auditRecorded && "A rede foi salva, mas o registro de auditoria falhou.",
    details.error &&
      "Os detalhes relacionados não puderam ser carregados novamente.",
  ]
    .filter(Boolean)
    .join(" ");

  return NextResponse.json(
    {
      network:
        details.error === null
          ?           toNetworkView(network, details, access)
          : toNetworkView(network, {
              networks: [network],
              cells: [],
              supervisors: [],
              leaders: [],
              members: [],
              error: null,
            }, access),
      warning,
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
      { error: "Líderes não podem editar redes." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Envie os dados da rede em formato JSON válido." },
      { status: 400 }
    );
  }

  if (!isRecord(body) || typeof body.id !== "string" || !body.id) {
    return NextResponse.json(
      { error: "Informe a rede que deseja editar." },
      { status: 400 }
    );
  }
  if (
    access.role === "supervisor" &&
    !access.networkIds.includes(body.id)
  ) {
    return NextResponse.json(
      { error: "Você não pode editar redes fora da sua responsabilidade." },
      { status: 403 }
    );
  }

  const input = parseNetworkInput(body);
  if (typeof input === "string") {
    return NextResponse.json({ error: input }, { status: 400 });
  }

  const supervisorIds = [
    ...new Set([
      ...input.supervisorIds,
      ...(access.role === "supervisor" ? [access.userId] : []),
    ]),
  ];
  const supervisorValidation = await validateSupervisors(access, supervisorIds);
  if (supervisorValidation.error) {
    console.error(
      "Erro ao validar supervisores:",
      supervisorValidation.error
    );
    return NextResponse.json(
      { error: "Não foi possível validar os supervisores selecionados." },
      { status: 500 }
    );
  }
  if (!supervisorValidation.valid) {
    return NextResponse.json(
      { error: "Selecione apenas supervisores ativos." },
      { status: 400 }
    );
  }

  const { data: current, error: currentError } = await access.adminClient
    .from("networks")
    .select("id, name, description, is_active, created_at")
    .eq("id", body.id)
    .maybeSingle();

  if (currentError) {
    console.error("Erro ao consultar rede para edição:", currentError);
    return NextResponse.json(
      { error: "Não foi possível carregar a rede para edição." },
      { status: 500 }
    );
  }
  if (!current) {
    return NextResponse.json(
      { error: "Rede não encontrada." },
      { status: 404 }
    );
  }

  const { data: assignments, error: assignmentError } = await access.adminClient
    .from("supervisor_networks")
    .select("supervisor_id")
    .eq("network_id", current.id);
  if (assignmentError) {
    console.error("Erro ao consultar supervisores atuais:", assignmentError);
    return NextResponse.json(
      { error: "Não foi possível carregar os supervisores atuais." },
      { status: 500 }
    );
  }

  const previousSupervisorIds = assignments.map(
    (assignment) => assignment.supervisor_id
  );
  const assignmentsChanged =
    [...previousSupervisorIds].sort().join(",") !==
    [...supervisorIds].sort().join(",");

  const { data: updated, error: updateError } = await access.adminClient
    .from("networks")
    .update({
      name: input.name,
      description: input.description,
      is_active: input.isActive,
    })
    .eq("id", current.id)
    .select("id, name, description, is_active, created_at")
    .single();
  if (updateError || !updated) {
    console.error("Erro ao atualizar rede:", updateError);
    return NextResponse.json(
      { error: "Não foi possível atualizar a rede." },
      { status: 500 }
    );
  }

  let assignmentWarning = "";
  if (assignmentsChanged) {
    const { error: removeError } = await access.adminClient
      .from("supervisor_networks")
      .delete()
      .eq("network_id", current.id);
    if (removeError) {
      console.error("Erro ao atualizar vínculos de supervisores:", removeError);
      assignmentWarning =
        "A rede foi atualizada, mas os vínculos dos supervisores não foram alterados.";
    } else if (supervisorIds.length) {
      const { error: insertError } = await access.adminClient
        .from("supervisor_networks")
        .insert(
          supervisorIds.map((supervisorId) => ({
            supervisor_id: supervisorId,
            network_id: current.id,
            created_at: new Date().toISOString(),
          }))
        );
      if (insertError) {
        console.error("Erro ao vincular supervisores:", insertError);
        if (previousSupervisorIds.length) {
          const { error: restoreError } = await access.adminClient
            .from("supervisor_networks")
            .insert(
              previousSupervisorIds.map((supervisorId) => ({
                supervisor_id: supervisorId,
                network_id: current.id,
                created_at: new Date().toISOString(),
              }))
            );
          if (restoreError) {
            console.error(
              "Erro ao restaurar vínculos de supervisores:",
              restoreError
            );
          }
        }
        assignmentWarning =
          "A rede foi atualizada, mas os supervisores não puderam ser vinculados.";
      }
    }
  }

  const auditRecorded = await writeAuditLog(access, {
    action: "network.updated",
    entityType: "network",
    entityId: updated.id,
    description: `Rede ${updated.name} atualizada.`,
    metadata: {
      previousSupervisorIds,
      requestedSupervisorIds: input.supervisorIds,
      supervisorAssignmentsSucceeded: !assignmentWarning,
      previousStatus: current.is_active,
      isActive: updated.is_active,
    },
  });

  const details = await loadNetworkData(access, [updated.id]);
  if (details.error) {
    console.error("Erro ao recarregar rede atualizada:", details.error);
  }

  return NextResponse.json({
    network:
      details.error === null
        ? toNetworkView(updated, details, access)
        : toNetworkView(updated, {
            networks: [updated],
            cells: [],
            supervisors: [],
            leaders: [],
            members: [],
            error: null,
          }, access),
    warning: [
      assignmentWarning,
      !auditRecorded && "A rede foi atualizada, mas a auditoria falhou.",
      details.error &&
        "Os detalhes relacionados não puderam ser carregados novamente.",
    ]
      .filter(Boolean)
      .join(" "),
  });
}
