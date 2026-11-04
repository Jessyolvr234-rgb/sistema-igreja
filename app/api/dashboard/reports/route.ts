import { NextResponse } from "next/server";
import {
  getAllCellIds,
  getDashboardAccess,
} from "@/lib/supabase/dashboard-access";

type MemberRow = {
  id: string;
  full_name: string;
  cell_id: string | null;
  is_active: boolean;
  created_at: string;
};

function accessFailure(
  result: Extract<Awaited<ReturnType<typeof getDashboardAccess>>, { ok: false }>
) {
  return NextResponse.json({ error: result.error }, { status: result.status });
}

function validDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function monthKey(value: string) {
  return value.slice(0, 7);
}

function monthKeys(from: string, to: string) {
  const keys: string[] = [];
  const cursor = new Date(`${from.slice(0, 7)}-01T00:00:00.000Z`);
  const last = new Date(`${to.slice(0, 7)}-01T00:00:00.000Z`);
  while (cursor <= last && keys.length < 36) {
    keys.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return keys;
}

async function loadMembers(
  access: Extract<
    Awaited<ReturnType<typeof getDashboardAccess>>,
    { ok: true }
  >["access"],
  cellIds: string[],
  status: string,
  restrictToCells: boolean
) {
  const members: MemberRow[] = [];
  const pageSize = 1000;
  let offset = 0;
  while (true) {
    let query = access.adminClient
      .from("members")
      .select("id, full_name, cell_id, is_active, created_at")
      .order("created_at", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (restrictToCells) {
      if (!cellIds.length) {
        return { members: [] as MemberRow[] };
      }
      query = query.in("cell_id", cellIds);
    }
    if (status === "active") {
      query = query.eq("is_active", true);
    } else if (status === "inactive") {
      query = query.eq("is_active", false);
    }
    const { data, error } = await query;
    if (error) {
      console.error("Erro ao consultar membros para relatórios:", error);
      return { error };
    }
    members.push(...data);
    if (data.length < pageSize) {
      break;
    }
    offset += pageSize;
  }
  return { members };
}

export async function GET(request: Request) {
  const result = await getDashboardAccess();
  if (!result.ok) {
    return accessFailure(result);
  }
  const { access } = result;
  const scope = await getAllCellIds(access);
  if ("error" in scope) {
    return NextResponse.json({ error: scope.error }, { status: 500 });
  }
  const params = new URL(request.url).searchParams;
  const requestedNetworkId = params.get("networkId");
  const requestedCellId = params.get("cellId");
  const status = params.get("status") ?? "";
  const today = new Date().toISOString().slice(0, 10);
  const { data: systemPreferences, error: preferencesError } =
    await access.adminClient
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", "system_preferences")
      .maybeSingle();
  if (preferencesError) {
    console.error("Erro ao consultar preferências para relatórios:", preferencesError);
    return NextResponse.json(
      { error: "Não foi possível carregar as preferências dos relatórios." },
      { status: 500 }
    );
  }
  const preferencesValue = systemPreferences?.setting_value;
  const configuredPeriod =
    preferencesValue &&
    typeof preferencesValue === "object" &&
    !Array.isArray(preferencesValue)
      ? preferencesValue.defaultReportPeriod
      : undefined;
  const periodMonths = [1, 3, 6, 12].includes(Number(configuredPeriod))
    ? Number(configuredPeriod)
    : 12;
  const defaultFromDate = new Date();
  defaultFromDate.setUTCMonth(
    defaultFromDate.getUTCMonth() - (periodMonths - 1)
  );
  defaultFromDate.setUTCDate(1);
  const from = params.get("from") ?? defaultFromDate.toISOString().slice(0, 10);
  const to = params.get("to") ?? today;

  if (
    !validDate(from) ||
    !validDate(to) ||
    from > to ||
    (status && status !== "active" && status !== "inactive")
  ) {
    return NextResponse.json(
      { error: "Os filtros do relatório são inválidos." },
      { status: 400 }
    );
  }
  if (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime() > 36 * 31 * 86400000) {
    return NextResponse.json(
      { error: "O período máximo dos relatórios é de 36 meses." },
      { status: 400 }
    );
  }

  const networksQuery = access.adminClient
    .from("networks")
    .select("id, name, is_active, created_at")
    .order("name", { ascending: true });
  const { data: networks, error: networksError } = await networksQuery;
  if (networksError) {
    console.error("Erro ao carregar redes para relatórios:", networksError);
    return NextResponse.json(
      { error: "Não foi possível carregar as redes autorizadas." },
      { status: 500 }
    );
  }
  const allowedNetworkIds = networks.map((network) => network.id);
  if (
    requestedNetworkId &&
    !allowedNetworkIds.includes(requestedNetworkId)
  ) {
    return NextResponse.json(
      { error: "Você não tem acesso a esta rede." },
      { status: 403 }
    );
  }

  const { data: scopedCells, error: scopedCellsError } = scope.cellIds.length
    ? await access.adminClient
        .from("cells")
        .select("id, name, network_id, leader_id, is_active, created_at")
        .in("id", scope.cellIds)
        .order("name", { ascending: true })
    : { data: [], error: null };
  if (scopedCellsError) {
    console.error("Erro ao carregar células para relatórios:", scopedCellsError);
    return NextResponse.json(
      { error: "Não foi possível carregar as células autorizadas." },
      { status: 500 }
    );
  }
  if (
    requestedCellId &&
    (!scope.cellIds.includes(requestedCellId) ||
      !scopedCells.some((cell) => cell.id === requestedCellId) ||
      (requestedNetworkId &&
        !scopedCells.some(
          (cell) =>
            cell.id === requestedCellId &&
            cell.network_id === requestedNetworkId
        )))
  ) {
    return NextResponse.json(
      { error: "Você não tem acesso a esta célula." },
      { status: 403 }
    );
  }

  const cells = scopedCells.filter(
    (cell) =>
      (!requestedNetworkId || cell.network_id === requestedNetworkId) &&
      (!requestedCellId || cell.id === requestedCellId)
  );
  const allowedCellIds = cells.map((cell) => cell.id);
  const selectedCellIds = cells.map((cell) => cell.id);
  const memberResult = await loadMembers(
    access,
    allowedCellIds,
    status,
    !!requestedNetworkId || !!requestedCellId
  );
  if ("error" in memberResult) {
    return NextResponse.json(
      { error: "Não foi possível carregar os membros autorizados." },
      { status: 500 }
    );
  }
  const memberRows = memberResult.members;

  const reportNetworkIds =
    requestedNetworkId
      ? [requestedNetworkId]
      : requestedCellId
        ? [
            cells.find((cell) => cell.id === requestedCellId)?.network_id,
          ].filter((id): id is string => !!id)
        : allowedNetworkIds;
  const reportNetworks = networks.filter((network) =>
    reportNetworkIds.includes(network.id)
  );
  const assignments = reportNetworkIds.length
    ? await access.adminClient
        .from("supervisor_networks")
        .select("network_id, supervisor_id")
        .in("network_id", reportNetworkIds)
    : { data: [], error: null };
  if (assignments.error) {
    console.error("Erro ao carregar supervisores dos relatórios:", assignments.error);
    return NextResponse.json(
      { error: "Não foi possível carregar os supervisores." },
      { status: 500 }
    );
  }
  const supervisorIds = [
    ...new Set((assignments.data ?? []).map((assignment) => assignment.supervisor_id)),
  ];
  const leaderIds = [
    ...new Set(cells.map((cell) => cell.leader_id).filter(Boolean)),
  ];
  const profileIds = [
    ...new Set([...supervisorIds, ...leaderIds]),
  ];
  const { data: scopedProfiles, error: scopedProfilesError } = profileIds.length
    ? await access.adminClient
        .from("profiles")
        .select("id, full_name, role, is_active")
        .in("id", profileIds)
    : { data: [], error: null };
  if (scopedProfilesError) {
    console.error("Erro ao carregar responsáveis dos relatórios:", scopedProfilesError);
    return NextResponse.json(
      { error: "Não foi possível carregar responsáveis." },
      { status: 500 }
    );
  }

  const { data: adminProfiles, error: adminProfilesError } =
    access.role === "admin" || access.role === "supervisor"
      ? await access.adminClient
          .from("profiles")
          .select("id, role")
          .in("role", ["supervisor", "leader"])
          .eq("is_active", true)
      : { data: [], error: null };
  if (adminProfilesError) {
    console.error("Erro ao contar usuários dos relatórios:", adminProfilesError);
    return NextResponse.json(
      { error: "Não foi possível calcular os indicadores de usuários." },
      { status: 500 }
    );
  }

  const networkMemberCounts = new Map<string, number>();
  const cellById = new Map(cells.map((cell) => [cell.id, cell]));
  for (const member of memberRows) {
    if (!member.cell_id) {
      continue;
    }
    const networkId = cellById.get(member.cell_id)?.network_id;
    if (networkId) {
      networkMemberCounts.set(
        networkId,
        (networkMemberCounts.get(networkId) ?? 0) + 1
      );
    }
  }

  const months = monthKeys(from, to);
  const memberGrowthCounts = new Map(months.map((month) => [month, 0]));
  const membersByCell = new Map<string, MemberRow[]>();
  for (const member of memberRows) {
    if (member.cell_id) {
      const list = membersByCell.get(member.cell_id) ?? [];
      list.push(member);
      membersByCell.set(member.cell_id, list);
    }
    if (member.created_at.slice(0, 10) >= from && member.created_at.slice(0, 10) <= to) {
      const month = monthKey(member.created_at);
      memberGrowthCounts.set(month, (memberGrowthCounts.get(month) ?? 0) + 1);
    }
  }

  const meetingRows: Array<{
    id: string;
    title: string;
    meeting_date: string;
    network_id: string | null;
    cell_id: string | null;
  }> = [];
  if (selectedCellIds.length) {
    const meetingQuery = access.adminClient
      .from("meetings")
      .select("id, title, meeting_date, network_id, cell_id")
      .in("cell_id", selectedCellIds)
      .gte("meeting_date", from)
      .lte("meeting_date", to)
      .order("meeting_date", { ascending: false });
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await meetingQuery.range(offset, offset + pageSize - 1);
      if (error) {
        console.error("Erro ao carregar reuniões para relatórios:", error);
        return NextResponse.json(
          { error: "Não foi possível carregar os dados de frequência." },
          { status: 500 }
        );
      }
      meetingRows.push(...data);
      if (data.length < pageSize) {
        break;
      }
      offset += pageSize;
    }
  }

  const attendanceRows: Array<{
    meeting_id: string;
    member_id: string;
    status: string;
  }> = [];
  const meetingIds = meetingRows.map((meeting) => meeting.id);
  for (let index = 0; index < meetingIds.length; index += 250) {
    const batch = meetingIds.slice(index, index + 250);
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await access.adminClient
        .from("attendance")
        .select("meeting_id, member_id, status")
        .in("meeting_id", batch)
        .order("meeting_id", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) {
        console.error("Erro ao carregar presenças para relatórios:", error);
        return NextResponse.json(
          { error: "Não foi possível carregar os dados de frequência." },
          { status: 500 }
        );
      }
      attendanceRows.push(...data);
      if (data.length < pageSize) {
        break;
      }
      offset += pageSize;
    }
  }

  const attendanceByMeeting = new Map<
    string,
    { present: number; absent: number; justified: number }
  >();
  const absentByMember = new Map<string, number>();
  const monthlyAttendance = new Map(
    months.map((month) => [
      month,
      { meetings: 0, present: 0, absent: 0, justified: 0 },
    ])
  );
  for (const meeting of meetingRows) {
    const month = monthKey(meeting.meeting_date);
    const current = monthlyAttendance.get(month);
    if (current) {
      current.meetings += 1;
    }
  }
  const meetingDateById = new Map(
    meetingRows.map((meeting) => [meeting.id, meeting.meeting_date])
  );
  for (const row of attendanceRows) {
    const counts = attendanceByMeeting.get(row.meeting_id) ?? {
      present: 0,
      absent: 0,
      justified: 0,
    };
    if (row.status === "present") {
      counts.present += 1;
    } else if (row.status === "absent") {
      counts.absent += 1;
      absentByMember.set(
        row.member_id,
        (absentByMember.get(row.member_id) ?? 0) + 1
      );
    } else if (row.status === "justified") {
      counts.justified += 1;
    }
    attendanceByMeeting.set(row.meeting_id, counts);
    const month = monthKey(meetingDateById.get(row.meeting_id) ?? "");
    const monthly = monthlyAttendance.get(month);
    if (monthly && row.status === "present") {
      monthly.present += 1;
    } else if (monthly && row.status === "absent") {
      monthly.absent += 1;
    } else if (monthly && row.status === "justified") {
      monthly.justified += 1;
    }
  }

  const totalPresent = attendanceRows.filter(
    (entry) => entry.status === "present"
  ).length;
  const recordedCount = attendanceRows.filter((entry) =>
    ["present", "absent", "justified"].includes(entry.status)
  ).length;

  const requirementsQuery = await access.adminClient
    .from("requirements")
    .select("id, title, field_type, is_required, is_active");
  if (requirementsQuery.error) {
    console.error("Erro ao carregar requisitos para relatórios:", requirementsQuery.error);
    return NextResponse.json(
      { error: "Não foi possível carregar os dados de requisitos." },
      { status: 500 }
    );
  }
  const requirementRows = requirementsQuery.data;
  const memberIds = memberRows.map((member) => member.id);
  const requirementAnswers: Array<{
    member_id: string;
    requirement_id: string;
    boolean_value: boolean | null;
    date_value: string | null;
    text_value: string | null;
    number_value: number | null;
    select_value: string | null;
  }> = [];
  for (let index = 0; index < memberIds.length; index += 250) {
    const batch = memberIds.slice(index, index + 250);
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await access.adminClient
        .from("member_requirements")
        .select(
          "member_id, requirement_id, boolean_value, date_value, text_value, number_value, select_value"
        )
        .in("member_id", batch)
        .order("requirement_id", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) {
        console.error("Erro ao carregar respostas para relatórios:", error);
        return NextResponse.json(
          { error: "Não foi possível carregar os dados de requisitos." },
          { status: 500 }
        );
      }
      requirementAnswers.push(...data);
      if (data.length < pageSize) {
        break;
      }
      offset += pageSize;
    }
  }

  const requirementComplete = (answer: (typeof requirementAnswers)[number], type: string) => {
    const value =
      type === "boolean"
        ? answer.boolean_value
        : type === "date"
          ? answer.date_value
          : type === "number"
            ? answer.number_value
            : type === "select"
              ? answer.select_value
              : answer.text_value;
    if (type === "boolean") {
      return value === true;
    }
    return typeof value === "string" ? value.trim().length > 0 : value !== null;
  };
  const requirementSummary = requirementRows.map((requirement) => {
    const completedMembers = new Set(
      requirementAnswers
        .filter(
          (answer) =>
            answer.requirement_id === requirement.id &&
            requirementComplete(answer, requirement.field_type)
        )
        .map((answer) => answer.member_id)
    );
    const complete = completedMembers.size;
    const pending = requirement.is_required
      ? Math.max(0, memberRows.length - complete)
      : 0;
    return {
      id: requirement.id,
      title: requirement.title,
      isActive: requirement.is_active,
      isRequired: requirement.is_required,
      completed: complete,
      pending,
      percentage: memberRows.length
        ? Math.round((complete / memberRows.length) * 100)
        : 0,
    };
  });

  const profileById = new Map(
    (scopedProfiles ?? []).map((profile) => [profile.id, profile])
  );
  const supervisorByNetwork = new Map<string, string[]>();
  for (const assignment of assignments.data ?? []) {
    const names = supervisorByNetwork.get(assignment.network_id) ?? [];
    const supervisorName = profileById.get(assignment.supervisor_id)?.full_name;
    if (supervisorName) {
      names.push(supervisorName);
    }
    supervisorByNetwork.set(assignment.network_id, names);
  }
  const networkRows = reportNetworks.map((network) => {
    const networkCells = cells.filter((cell) => cell.network_id === network.id);
    const networkActiveMembers = networkCells.reduce(
      (sum, cell) =>
        sum +
        (membersByCell.get(cell.id) ?? []).filter((member) => member.is_active)
          .length,
      0
    );
    return {
      id: network.id,
      name: network.name,
      isActive: network.is_active,
      cellCount: networkCells.length,
      activeCellCount: networkCells.filter((cell) => cell.is_active).length,
      memberCount: networkMemberCounts.get(network.id) ?? 0,
      activeMembers: networkActiveMembers,
      supervisors: supervisorByNetwork.get(network.id) ?? [],
    };
  });

  const cellRows = cells.map((cell) => ({
    id: cell.id,
    name: cell.name,
    networkId: cell.network_id,
    networkName:
      networks.find((network) => network.id === cell.network_id)?.name ?? "Rede",
    leaderName: cell.leader_id
      ? profileById.get(cell.leader_id)?.full_name ?? "Não informado"
      : "Não informado",
    isActive: cell.is_active,
    memberCount: membersByCell.get(cell.id)?.length ?? 0,
    activeMembers:
      membersByCell.get(cell.id)?.filter((member) => member.is_active).length ??
      0,
    newMembers: (membersByCell.get(cell.id) ?? []).filter(
      (member) =>
        member.created_at.slice(0, 10) >= from &&
        member.created_at.slice(0, 10) <= to
    ).length,
  }));

  const meetingCellById = new Map(cells.map((cell) => [cell.id, cell]));
  const meetingNetworkById = new Map(
    reportNetworks.map((network) => [network.id, network.name])
  );
  const attendanceReport = meetingRows.map((meeting) => {
    const counts = attendanceByMeeting.get(meeting.id) ?? {
      present: 0,
      absent: 0,
      justified: 0,
    };
    const total = counts.present + counts.absent + counts.justified;
    return {
      id: meeting.id,
      date: meeting.meeting_date,
      title: meeting.title,
      networkName: meeting.network_id
        ? meetingNetworkById.get(meeting.network_id) ?? "Rede"
        : "Rede",
      cellName: meeting.cell_id
        ? meetingCellById.get(meeting.cell_id)?.name ?? "Célula"
        : "Célula",
      total,
      ...counts,
      percentage: total ? Math.round((counts.present / total) * 100) : 0,
    };
  });
  const memberById = new Map(memberRows.map((member) => [member.id, member.full_name]));
  const frequentAbsences = [...absentByMember.entries()]
    .filter(([memberId, count]) => count >= 3 && memberById.has(memberId))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([memberId, absences]) => ({
      memberId,
      fullName: memberById.get(memberId) ?? "Membro",
      absences,
    }));

  const activeMembers = memberRows.filter((member) => member.is_active).length;
  const inactiveMembers = memberRows.length - activeMembers;
  const profileCount = (role: "supervisor" | "leader") =>
    (scopedProfiles ?? []).filter(
      (profile) => profile.role === role && profile.is_active
    ).length;

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    filters: { from, to, networkId: requestedNetworkId, cellId: requestedCellId, status },
    stats: {
      totalMembers: memberRows.length,
      activeMembers,
      inactiveMembers,
      totalNetworks: reportNetworks.length,
      totalCells: cells.length,
      totalSupervisors:
        access.role === "admin"
          ? (adminProfiles ?? []).filter((profile) => profile.role === "supervisor").length
          : profileCount("supervisor"),
      totalLeaders:
        access.role === "admin"
          ? (adminProfiles ?? []).filter((profile) => profile.role === "leader").length
          : profileCount("leader"),
      newMembers: [...memberGrowthCounts.values()].reduce(
        (sum, value) => sum + value,
        0
      ),
      averageAttendance: recordedCount
        ? Math.round((totalPresent / recordedCount) * 100)
        : 0,
    },
    memberGrowth: months.map((month) => ({
      month,
      total: memberGrowthCounts.get(month) ?? 0,
    })),
    networks: networkRows,
    networkOptions: networks.map((network) => ({
      id: network.id,
      name: network.name,
    })),
    cellOptions: scopedCells.map((cell) => ({
      id: cell.id,
      name: cell.name,
      networkId: cell.network_id,
    })),
    cells: cellRows,
    attendance: attendanceReport,
    attendanceByMonth: months.map((month) => {
      const counts = monthlyAttendance.get(month) ?? {
        meetings: 0,
        present: 0,
        absent: 0,
        justified: 0,
      };
      const total = counts.present + counts.absent + counts.justified;
      return {
        month,
        ...counts,
        percentage: total ? Math.round((counts.present / total) * 100) : 0,
      };
    }),
    frequentAbsences,
    requirements: requirementSummary,
    requirementStats: {
      completed: requirementSummary.reduce(
        (sum, requirement) => sum + requirement.completed,
        0
      ),
      pending: requirementSummary.reduce(
        (sum, requirement) => sum + requirement.pending,
        0
      ),
    },
  });
}
