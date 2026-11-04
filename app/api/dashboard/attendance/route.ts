import { NextResponse } from "next/server";
import {
  canAccessCell,
  getAllCellIds,
  getAccessibleCellIds,
  getDashboardAccess,
} from "@/lib/supabase/dashboard-access";
import { writeAuditLog } from "@/lib/supabase/audit";

type AttendanceStatus = "present" | "absent" | "justified";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function accessFailure(
  result: Extract<Awaited<ReturnType<typeof getDashboardAccess>>, { ok: false }>
) {
  return NextResponse.json({ error: result.error }, { status: result.status });
}

function matchesStatus(value: string): value is AttendanceStatus {
  return value === "present" || value === "absent" || value === "justified";
}

function isAttendanceInput(
  value: unknown
): value is { memberId: string; status: AttendanceStatus } {
  return (
    isRecord(value) &&
    typeof value.memberId === "string" &&
    typeof value.status === "string" &&
    matchesStatus(value.status)
  );
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

  const { data: cells, error: cellsError } = scope.cellIds.length
    ? await access.adminClient
        .from("cells")
        .select("id, name, network_id, is_active")
        .in("id", scope.cellIds)
        .order("name", { ascending: true })
    : { data: [], error: null };
  if (cellsError) {
    console.error("Erro ao consultar células para frequência:", cellsError);
    return NextResponse.json(
      { error: "Não foi possível carregar as células autorizadas." },
      { status: 500 }
    );
  }

  const networkIds = [...new Set(cells.map((cell) => cell.network_id))];
  const { data: networks, error: networksError } = networkIds.length
    ? await access.adminClient
        .from("networks")
        .select("id, name")
        .in("id", networkIds)
        .order("name", { ascending: true })
    : { data: [], error: null };
  if (networksError) {
    console.error("Erro ao consultar redes para frequência:", networksError);
    return NextResponse.json(
      { error: "Não foi possível carregar as redes autorizadas." },
      { status: 500 }
    );
  }

  const params = new URL(request.url).searchParams;
  const requestedCellId = params.get("cellId");
  const requestedDate = params.get("date");
  const requestedMeetingId = params.get("meetingId");

  if (requestedMeetingId) {
    const { data: meeting, error: meetingError } = await access.adminClient
      .from("meetings")
      .select(
        "id, title, description, meeting_date, start_time, end_time, network_id, cell_id, created_at"
      )
      .eq("id", requestedMeetingId)
      .maybeSingle();
    if (meetingError) {
      console.error("Erro ao consultar reunião:", meetingError);
      return NextResponse.json(
        { error: "Não foi possível carregar a reunião." },
        { status: 500 }
      );
    }
    if (!meeting || !scope.cellIds.includes(meeting.cell_id ?? "")) {
      return NextResponse.json(
        { error: "Reunião não encontrada ou sem permissão de acesso." },
        { status: 404 }
      );
    }

    const { data: attendance, error: attendanceError } = await access.adminClient
      .from("attendance")
      .select("id, member_id, status, notes, registered_by, created_at")
      .eq("meeting_id", meeting.id)
      .order("created_at", { ascending: true });
    if (attendanceError) {
      console.error("Erro ao carregar presença da reunião:", attendanceError);
      return NextResponse.json(
        { error: "Não foi possível carregar os registros de frequência." },
        { status: 500 }
      );
    }
    const memberIds = [...new Set(attendance.map((entry) => entry.member_id))];
    const { data: members, error: membersError } = memberIds.length
      ? await access.adminClient
          .from("members")
          .select("id, full_name, email, phone")
          .in("id", memberIds)
      : { data: [], error: null };
    if (membersError) {
      console.error("Erro ao carregar membros da frequência:", membersError);
      return NextResponse.json(
        { error: "Não foi possível carregar os membros da reunião." },
        { status: 500 }
      );
    }
    const memberById = new Map(
      members.map((member) => [member.id, member])
    );

    return NextResponse.json({
      meeting: {
        id: meeting.id,
        title: meeting.title,
        description: meeting.description,
        date: meeting.meeting_date,
        startTime: meeting.start_time,
        endTime: meeting.end_time,
        networkId: meeting.network_id,
        cellId: meeting.cell_id,
        createdAt: meeting.created_at,
      },
      attendance: attendance.map((entry) => ({
        id: entry.id,
        memberId: entry.member_id,
        memberName: memberById.get(entry.member_id)?.full_name ?? "Membro",
        status: entry.status,
        notes: entry.notes,
        registeredBy: entry.registered_by,
        createdAt: entry.created_at,
      })),
    });
  }

  if (requestedCellId || requestedDate) {
    if (
      !requestedCellId ||
      !requestedDate ||
      !validDate(requestedDate) ||
      !scope.cellIds.includes(requestedCellId)
    ) {
      return NextResponse.json(
        { error: "Selecione uma célula e uma data válidas." },
        { status: 400 }
      );
    }

    const cell = cells.find((item) => item.id === requestedCellId);
    if (!cell) {
      return NextResponse.json(
        { error: "Célula não encontrada ou sem permissão de acesso." },
        { status: 404 }
      );
    }

    const [membersResult, meetingResult] = await Promise.all([
      access.adminClient
        .from("members")
        .select("id, full_name, email, phone")
        .eq("cell_id", cell.id)
        .eq("is_active", true)
        .order("full_name", { ascending: true }),
      access.adminClient
        .from("meetings")
        .select("id, title, description")
        .eq("cell_id", cell.id)
        .eq("meeting_date", requestedDate)
        .eq("is_active", true)
        .limit(2),
    ]);

    if (membersResult.error || meetingResult.error) {
      console.error(
        "Erro ao preparar lista de frequência:",
        membersResult.error ?? meetingResult.error
      );
      return NextResponse.json(
        { error: "Não foi possível preparar a lista de frequência." },
        { status: 500 }
      );
    }

    if ((meetingResult.data ?? []).length > 1) {
      return NextResponse.json(
        {
          error:
            "Há mais de uma reunião ativa nesta célula e data. Consulte o administrador antes de registrar a frequência.",
        },
        { status: 409 }
      );
    }

    const meeting = meetingResult.data?.[0] ?? null;
    const { data: records, error: recordsError } = meeting
      ? await access.adminClient
          .from("attendance")
          .select("id, member_id, status, notes")
          .eq("meeting_id", meeting.id)
      : { data: [], error: null };
    if (recordsError) {
      console.error("Erro ao carregar marcações existentes:", recordsError);
      return NextResponse.json(
        { error: "Não foi possível carregar as marcações existentes." },
        { status: 500 }
      );
    }
    const statusByMemberId = new Map<string, string>();
    for (const record of records) {
      if (!statusByMemberId.has(record.member_id)) {
        statusByMemberId.set(record.member_id, record.status);
      }
    }

    return NextResponse.json({
      network: networks.find((item) => item.id === cell.network_id) ?? null,
      cell: { id: cell.id, name: cell.name, networkId: cell.network_id },
      date: requestedDate,
      meeting: meeting
        ? {
            id: meeting.id,
            title: meeting.title,
            description: meeting.description,
          }
        : null,
      members: membersResult.data.map((member) => ({
        id: member.id,
        fullName: member.full_name,
        email: member.email,
        phone: member.phone,
        status: statusByMemberId.get(member.id) ?? "",
      })),
      canRecordAttendance: await canAccessCell(access, cell.id),
    });
  }

  let visibleCells = cells;
  const selectedNetworkId = params.get("networkId");
  if (selectedNetworkId) {
    visibleCells = cells.filter((cell) => cell.network_id === selectedNetworkId);
  }
  const visibleCellIds = visibleCells.map((cell) => cell.id);
  if (visibleCellIds.length === 0) {
    return NextResponse.json({
      networks: networks ?? [],
      cells: cells.map((cell) => ({
        id: cell.id,
        name: cell.name,
        networkId: cell.network_id,
        canRecord:
          access.role === "admin" ||
          (access.role === "supervisor" &&
            access.networkIds.includes(cell.network_id)) ||
          (access.role === "leader" && access.cellIds.includes(cell.id)),
      })),
      meetings: [],
    });
  }

  const from = params.get("from");
  const to = params.get("to");
  if ((from && !validDate(from)) || (to && !validDate(to))) {
    return NextResponse.json(
      { error: "O período informado é inválido." },
      { status: 400 }
    );
  }

  let meetingsQuery = access.adminClient
    .from("meetings")
    .select(
      "id, title, description, meeting_date, network_id, cell_id, created_at"
    )
    .in("cell_id", visibleCellIds)
    .order("meeting_date", { ascending: false })
    .limit(200);
  if (from) {
    meetingsQuery = meetingsQuery.gte("meeting_date", from);
  }
  if (to) {
    meetingsQuery = meetingsQuery.lte("meeting_date", to);
  }

  const { data: meetings, error: meetingsError } = await meetingsQuery;
  if (meetingsError) {
    console.error("Erro ao carregar histórico de frequência:", meetingsError);
    return NextResponse.json(
      { error: "Não foi possível carregar o histórico de frequência." },
      { status: 500 }
    );
  }
  const meetingIds = meetings.map((meeting) => meeting.id);
  const { data: attendance, error: attendanceError } = meetingIds.length
    ? await access.adminClient
        .from("attendance")
        .select("meeting_id, member_id, status")
        .in("meeting_id", meetingIds)
    : { data: [], error: null };
  if (attendanceError) {
    console.error("Erro ao calcular histórico de frequência:", attendanceError);
    return NextResponse.json(
      { error: "Não foi possível calcular o histórico de frequência." },
      { status: 500 }
    );
  }

  const cellById = new Map(cells.map((cell) => [cell.id, cell]));
  const attendanceByMeeting = new Map<
    string,
    Array<{ memberId: string; status: string }>
  >();
  for (const record of attendance) {
    const list = attendanceByMeeting.get(record.meeting_id) ?? [];
    list.push({ memberId: record.member_id, status: record.status });
    attendanceByMeeting.set(record.meeting_id, list);
  }

  return NextResponse.json({
    networks: networks ?? [],
    cells: cells.map((cell) => ({
      id: cell.id,
      name: cell.name,
      networkId: cell.network_id,
      canRecord:
        access.role === "admin" ||
        (access.role === "supervisor" &&
          access.networkIds.includes(cell.network_id)) ||
        (access.role === "leader" && access.cellIds.includes(cell.id)),
    })),
    meetings: meetings.map((meeting) => {
      const entries = attendanceByMeeting.get(meeting.id) ?? [];
      const present = entries.filter((entry) => entry.status === "present").length;
      const absent = entries.filter((entry) => entry.status === "absent").length;
      const justified = entries.filter(
        (entry) => entry.status === "justified"
      ).length;
      const marked = present + absent + justified;
      return {
        id: meeting.id,
        title: meeting.title,
        notes: meeting.description,
        date: meeting.meeting_date,
        networkId: meeting.network_id,
        networkName:
          networks.find((network) => network.id === meeting.network_id)?.name ??
          "Rede",
        cellId: meeting.cell_id,
        cellName: cellById.get(meeting.cell_id ?? "")?.name ?? "Célula",
        totalMembers: marked,
        present,
        absent,
        justified,
        percentage: marked ? Math.round((present / marked) * 100) : 0,
      };
    }),
  });
}

export async function POST(request: Request) {
  const result = await getDashboardAccess();
  if (!result.ok) {
    return accessFailure(result);
  }
  const { access } = result;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Envie os dados de frequência em formato JSON válido." },
      { status: 400 }
    );
  }
  if (
    !isRecord(body) ||
    typeof body.cellId !== "string" ||
    typeof body.networkId !== "string" ||
    typeof body.date !== "string" ||
    !validDate(body.date) ||
    !Array.isArray(body.attendance)
  ) {
    return NextResponse.json(
      { error: "Informe a rede, célula, data e marcações da reunião." },
      { status: 400 }
    );
  }
  const notes =
    typeof body.notes === "string" && body.notes.trim()
      ? body.notes.trim()
      : null;
  if (notes && notes.length > 2000) {
    return NextResponse.json(
      { error: "As observações devem ter até 2.000 caracteres." },
      { status: 400 }
    );
  }
  const entries = body.attendance;
  if (
    entries.length === 0 ||
    !entries.every(isAttendanceInput)
  ) {
    return NextResponse.json(
      { error: "Marque cada membro como presente, ausente ou justificado." },
      { status: 400 }
    );
  }

  const scope = await getAccessibleCellIds(access);
  if ("error" in scope) {
    return NextResponse.json({ error: scope.error }, { status: 500 });
  }
  if (!scope.cellIds.includes(body.cellId)) {
    return NextResponse.json(
      { error: "Você não tem permissão para registrar frequência nesta célula." },
      { status: 403 }
    );
  }

  const { data: cell, error: cellError } = await access.adminClient
    .from("cells")
    .select("id, name, network_id")
    .eq("id", body.cellId)
    .maybeSingle();
  if (cellError) {
    console.error("Erro ao consultar célula da frequência:", cellError);
    return NextResponse.json(
      { error: "Não foi possível validar a célula." },
      { status: 500 }
    );
  }
  if (!cell || cell.network_id !== body.networkId) {
    return NextResponse.json(
      { error: "A rede selecionada não corresponde à célula." },
      { status: 400 }
    );
  }

  const { data: members, error: membersError } = await access.adminClient
    .from("members")
    .select("id")
    .eq("cell_id", cell.id)
    .eq("is_active", true);
  if (membersError) {
    console.error("Erro ao validar lista de membros:", membersError);
    return NextResponse.json(
      { error: "Não foi possível validar os membros da célula." },
      { status: 500 }
    );
  }
  const allowedMemberIds = new Set(members.map((member) => member.id));
  const submittedIds = entries.map((entry) => entry.memberId);
  if (
    new Set(submittedIds).size !== submittedIds.length ||
    submittedIds.some((memberId) => !allowedMemberIds.has(memberId)) ||
    submittedIds.length !== allowedMemberIds.size
  ) {
    return NextResponse.json(
      {
        error:
          "A lista enviada não corresponde aos membros ativos da célula. Atualize a tela e tente novamente.",
      },
      { status: 400 }
    );
  }

  const { data: existingMeetings, error: meetingLookupError } =
    await access.adminClient
      .from("meetings")
      .select("id, title, description")
      .eq("cell_id", cell.id)
      .eq("meeting_date", body.date)
      .eq("is_active", true)
      .limit(2);
  if (meetingLookupError) {
    console.error("Erro ao consultar reunião existente:", meetingLookupError);
    return NextResponse.json(
      { error: "Não foi possível consultar a reunião." },
      { status: 500 }
    );
  }
  if (existingMeetings.length > 1) {
    return NextResponse.json(
      {
        error:
          "Há mais de uma reunião ativa nesta célula e data; não é seguro registrar frequência.",
      },
      { status: 409 }
    );
  }

  let meeting = existingMeetings[0] ?? null;
  const generatedTitle = `Reunião de célula - ${cell.name}`;
  if (!meeting) {
    const { data: createdMeeting, error: createMeetingError } =
      await access.adminClient
        .from("meetings")
        .insert({
          title: generatedTitle,
          description: notes,
          meeting_date: body.date,
          network_id: cell.network_id,
          cell_id: cell.id,
          created_by: access.userId,
          is_active: true,
        })
        .select("id, title, description")
        .single();
    if (createMeetingError || !createdMeeting) {
      console.error("Erro ao criar reunião para frequência:", createMeetingError);
      return NextResponse.json(
        { error: "Não foi possível criar a reunião para registrar frequência." },
        { status: 500 }
      );
    }
    meeting = createdMeeting;
  } else if (notes !== meeting.description) {
    const { error: noteError } = await access.adminClient
      .from("meetings")
      .update({ description: notes })
      .eq("id", meeting.id);
    if (noteError) {
      console.error("Erro ao atualizar observações da reunião:", noteError);
      return NextResponse.json(
        { error: "Não foi possível atualizar as observações da reunião." },
        { status: 500 }
      );
    }
  }

  const { data: existingEntries, error: existingEntriesError } =
    await access.adminClient
      .from("attendance")
      .select("id, member_id, status")
      .eq("meeting_id", meeting.id);
  if (existingEntriesError) {
    console.error("Erro ao consultar marcações existentes:", existingEntriesError);
    return NextResponse.json(
      { error: "Não foi possível consultar as marcações existentes." },
      { status: 500 }
    );
  }

  const submittedByMemberId = new Map(
    entries.map((entry) => [entry.memberId, entry.status])
  );
  const priorByMemberId = new Map(
    existingEntries.map((entry) => [entry.member_id, entry.status])
  );
  const changesExisting = existingEntries.some(
    (entry) =>
      submittedByMemberId.get(entry.member_id) !== entry.status
  );
  if (access.role === "leader" && changesExisting) {
    return NextResponse.json(
      {
        error:
          "Líderes podem completar marcações pendentes, mas apenas administradores ou supervisores podem corrigir frequências já registradas.",
      },
      { status: 403 }
    );
  }

  const updateErrors: unknown[] = [];
  for (const [memberId, nextStatus] of submittedByMemberId) {
    if (!priorByMemberId.has(memberId)) {
      continue;
    }
    const previousStatus = priorByMemberId.get(memberId);
    if (previousStatus === nextStatus) {
      continue;
    }
    const { error } = await access.adminClient
      .from("attendance")
      .update({ status: nextStatus })
      .eq("meeting_id", meeting.id)
      .eq("member_id", memberId);
    if (error) {
      console.error("Erro ao corrigir presença:", error);
      updateErrors.push(error);
    }
  }

  const newEntries = [...submittedByMemberId.entries()]
    .filter(([memberId]) => !priorByMemberId.has(memberId))
    .map(([memberId, status]) => ({
      meeting_id: meeting.id,
      member_id: memberId,
      status,
      registered_by: access.userId,
    }));
  let insertError: unknown = null;
  if (newEntries.length) {
    const { error } = await access.adminClient
      .from("attendance")
      .insert(newEntries);
    if (error) {
      console.error("Erro ao salvar novas presenças:", error);
      insertError = error;
    }
  }

  if (updateErrors.length || insertError) {
    return NextResponse.json(
      {
        error:
          "A frequência foi salva parcialmente. Atualize a página e confira os registros antes de tentar novamente.",
      },
      { status: 500 }
    );
  }

  const auditRecorded = await writeAuditLog(access, {
    action: existingEntries.length ? "attendance.corrected" : "attendance.created",
    entityType: "meeting",
    entityId: meeting.id,
    description: `Frequência da célula ${cell.name} registrada em ${body.date}.`,
    metadata: {
      cellId: cell.id,
      networkId: cell.network_id,
      date: body.date,
      total: submittedByMemberId.size,
      present: [...submittedByMemberId.values()].filter(
        (status) => status === "present"
      ).length,
      absent: [...submittedByMemberId.values()].filter(
        (status) => status === "absent"
      ).length,
      justified: [...submittedByMemberId.values()].filter(
        (status) => status === "justified"
      ).length,
      previousStatuses: Object.fromEntries(priorByMemberId),
      statuses: Object.fromEntries(submittedByMemberId),
    },
  });

  return NextResponse.json({
    meetingId: meeting.id,
    warning: auditRecorded
      ? ""
      : "A frequência foi salva, mas o registro de auditoria falhou.",
  });
}
