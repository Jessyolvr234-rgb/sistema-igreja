import { NextResponse } from "next/server";
import {
  canAccessCell,
  getAccessibleCellIds,
  getDashboardAccess,
} from "@/lib/supabase/dashboard-access";
import { writeAuditLog } from "@/lib/supabase/audit";

type RequirementFieldType = "boolean" | "text" | "number" | "date" | "select";
type RequirementInput = {
  title: string;
  description: string | null;
  fieldType: RequirementFieldType;
  options: string[] | null;
  isRequired: boolean;
  isActive: boolean;
};
type RequirementAnswer = {
  boolean_value: boolean | null;
  date_value: string | null;
  text_value: string | null;
  number_value: number | null;
  select_value: string | null;
};
type AccessibleMember = { id: string; cell_id: string | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isFieldType(value: unknown): value is RequirementFieldType {
  return (
    value === "boolean" ||
    value === "text" ||
    value === "number" ||
    value === "date" ||
    value === "select"
  );
}

function validDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function valueForField(
  answer: RequirementAnswer,
  fieldType: RequirementFieldType
) {
  switch (fieldType) {
    case "boolean":
      return answer.boolean_value;
    case "date":
      return answer.date_value;
    case "number":
      return answer.number_value;
    case "select":
      return answer.select_value;
    case "text":
      return answer.text_value;
  }
}

function answerIsComplete(
  answer: RequirementAnswer,
  fieldType: RequirementFieldType
) {
  const value = valueForField(answer, fieldType);
  if (fieldType === "boolean") {
    return value === true;
  }
  return typeof value === "string" ? value.trim().length > 0 : value !== null;
}

function parseRequirementInput(value: unknown): RequirementInput | string {
  if (!isRecord(value)) {
    return "Os dados enviados são inválidos.";
  }

  const title = typeof value.title === "string" ? value.title.trim() : "";
  const description =
    typeof value.description === "string" && value.description.trim()
      ? value.description.trim()
      : null;
  const fieldType = value.fieldType;
  const isRequired = value.isRequired;
  const isActive = value.isActive === undefined ? true : value.isActive;
  let options: string[] | null = null;

  if (!title || title.length > 180) {
    return "Informe o nome do requisito (até 180 caracteres).";
  }
  if (description && description.length > 2000) {
    return "A descrição deve ter até 2.000 caracteres.";
  }
  if (!isFieldType(fieldType)) {
    return "Selecione um tipo de resposta válido.";
  }
  if (typeof isRequired !== "boolean" || typeof isActive !== "boolean") {
    return "As opções de obrigatoriedade ou situação são inválidas.";
  }

  if (fieldType === "select") {
    if (
      !Array.isArray(value.options) ||
      value.options.length < 2 ||
      value.options.length > 50 ||
      value.options.some(
        (option) => typeof option !== "string" || !option.trim()
      )
    ) {
      return "Informe de 2 a 50 opções válidas para este requisito.";
    }
    options = [
      ...new Set(
        value.options
          .filter((option): option is string => typeof option === "string")
          .map((option) => option.trim())
          .filter(Boolean)
      ),
    ];
    if (options.length < 2 || options.some((option) => option.length > 120)) {
      return "Cada opção deve ter até 120 caracteres.";
    }
  } else if (value.options !== undefined && value.options !== null) {
    return "As opções só podem ser informadas para respostas do tipo seleção.";
  }

  return {
    title,
    description,
    fieldType,
    options,
    isRequired,
    isActive,
  };
}

function parseAnswer(value: unknown, requirement: {
  field_type: string;
  options: unknown;
  is_required: boolean;
}) {
  if (!isRecord(value) || !isFieldType(requirement.field_type)) {
    return "A resposta enviada é inválida.";
  }

  const answerValue = value.value;
  const notes =
    typeof value.notes === "string" && value.notes.trim()
      ? value.notes.trim()
      : null;
  if (notes && notes.length > 1000) {
    return "A observação deve ter até 1.000 caracteres.";
  }

  const empty: RequirementAnswer = {
    boolean_value: null,
    date_value: null,
    text_value: null,
    number_value: null,
    select_value: null,
  };

  if (answerValue === "" || answerValue === null) {
    return { answer: empty, notes };
  }

  switch (requirement.field_type) {
    case "boolean":
      if (typeof answerValue !== "boolean") {
        return "Responda sim ou não.";
      }
      empty.boolean_value = answerValue;
      break;
    case "text":
      if (typeof answerValue !== "string" || answerValue.trim().length > 5000) {
        return "Informe um texto de até 5.000 caracteres.";
      }
      if (requirement.is_required && !answerValue.trim()) {
        return "Este requisito é obrigatório e precisa de uma resposta.";
      }
      empty.text_value = answerValue.trim() || null;
      break;
    case "number":
      if (
        typeof answerValue !== "number" ||
        !Number.isFinite(answerValue) ||
        answerValue < -1_000_000_000_000 ||
        answerValue > 1_000_000_000_000
      ) {
        return "Informe um número válido.";
      }
      empty.number_value = answerValue;
      break;
    case "date":
      if (typeof answerValue !== "string" || !validDate(answerValue)) {
        return "Informe uma data válida.";
      }
      empty.date_value = answerValue;
      break;
    case "select": {
      const options = Array.isArray(requirement.options)
        ? requirement.options.filter(
            (option): option is string => typeof option === "string"
          )
        : [];
      if (
        typeof answerValue !== "string" ||
        !options.includes(answerValue)
      ) {
        return "Selecione uma das opções cadastradas.";
      }
      empty.select_value = answerValue;
      break;
    }
  }

  return { answer: empty, notes };
}

function accessFailure(
  result: Extract<Awaited<ReturnType<typeof getDashboardAccess>>, { ok: false }>
) {
  return NextResponse.json({ error: result.error }, { status: result.status });
}

async function loadAccessibleMembers(
  access: Extract<
    Awaited<ReturnType<typeof getDashboardAccess>>,
    { ok: true }
  >["access"],
  cellIds: string[]
): Promise<{ members: AccessibleMember[] } | { error: unknown }> {
  const pageSize = 1000;
  const members: AccessibleMember[] = [];
  let offset = 0;

  while (true) {
    let query = access.adminClient
      .from("members")
      .select("id, cell_id")
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (access.role !== "admin") {
      if (!cellIds.length) {
        return { members: [] };
      }
      query = query.in("cell_id", cellIds);
    }
    const { data, error } = await query;
    if (error) {
      console.error("Erro ao consultar membros para requisitos:", error);
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

async function loadAccessibleAnswers(
  access: Extract<
    Awaited<ReturnType<typeof getDashboardAccess>>,
    { ok: true }
  >["access"],
  memberIds: string[]
) {
  const answers: Array<
    RequirementAnswer & {
      id: string;
      member_id: string;
      requirement_id: string;
      notes: string | null;
      updated_by: string | null;
      updated_at: string;
    }
  > = [];
  const idBatchSize = 250;
  const pageSize = 1000;

  for (let index = 0; index < memberIds.length; index += idBatchSize) {
    const batch = memberIds.slice(index, index + idBatchSize);
    let offset = 0;
    while (true) {
      const { data, error } = await access.adminClient
        .from("member_requirements")
        .select(
          "id, member_id, requirement_id, boolean_value, date_value, text_value, number_value, select_value, notes, updated_by, updated_at"
        )
        .in("member_id", batch)
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) {
        console.error("Erro ao consultar respostas de requisitos:", error);
        return { error };
      }
      answers.push(...data);
      if (data.length < pageSize) {
        break;
      }
      offset += pageSize;
    }
  }

  return { answers };
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

  const { data: requirements, error: requirementsError } =
    await access.adminClient
      .from("requirements")
      .select(
        "id, title, description, field_type, options, is_required, is_active, created_by, created_at"
      )
      .order("created_at", { ascending: false });
  if (requirementsError) {
    console.error("Erro ao carregar requisitos:", requirementsError);
    return NextResponse.json(
      { error: "Não foi possível carregar os requisitos." },
      { status: 500 }
    );
  }

  const memberResult = await loadAccessibleMembers(access, scope.cellIds);
  if ("error" in memberResult) {
    return NextResponse.json(
      { error: "Não foi possível carregar os membros autorizados." },
      { status: 500 }
    );
  }
  const accessibleMemberIds = memberResult.members.map((member) => member.id);
  const answersResult = await loadAccessibleAnswers(access, accessibleMemberIds);
  if ("error" in answersResult) {
    return NextResponse.json(
      { error: "Não foi possível carregar as respostas autorizadas." },
      { status: 500 }
    );
  }
  const requirementsById = new Map(
    requirements.map((requirement) => [requirement.id, requirement])
  );
  const activeRequirements = requirements.filter(
    (requirement) => requirement.is_active
  );
  const completedAnswers = answersResult.answers.filter((answer) => {
    const requirement = requirementsById.get(answer.requirement_id);
    return (
      requirement?.is_active &&
      isFieldType(requirement.field_type) &&
      answerIsComplete(answer, requirement.field_type)
    );
  });
  const completedRequiredAnswers = completedAnswers.filter((answer) => {
    const requirement = requirementsById.get(answer.requirement_id);
    return requirement?.is_required;
  });
  const completedRequiredPairs = new Set(
    completedRequiredAnswers.map(
      (answer) => `${answer.member_id}:${answer.requirement_id}`
    )
  );
  const completedPairs = new Set(
    completedAnswers.map(
      (answer) => `${answer.member_id}:${answer.requirement_id}`
    )
  );

  const params = new URL(request.url).searchParams;
  const memberId = params.get("memberId");
  const memberSearch = (params.get("memberSearch") ?? "")
    .replace(/[^\p{L}\p{N}@._+\-\s]/gu, " ")
    .trim()
    .slice(0, 100);
  const requirementIdFilter = params.get("requirementId");
  const answerStatusFilter = params.get("answerStatus");

  if (memberSearch) {
    const filterRequirement = requirementIdFilter
      ? requirementsById.get(requirementIdFilter)
      : null;
    if (
      (requirementIdFilter && !filterRequirement) ||
      (answerStatusFilter &&
        answerStatusFilter !== "complete" &&
        answerStatusFilter !== "pending") ||
      (answerStatusFilter && !requirementIdFilter)
    ) {
      return NextResponse.json(
        { error: "O filtro por requisito é inválido." },
        { status: 400 }
      );
    }

    let memberQuery = access.adminClient
      .from("members")
      .select("id, full_name, email, phone, cell_id, is_active")
      .or(
        `full_name.ilike.%${memberSearch}%,email.ilike.%${memberSearch}%,phone.ilike.%${memberSearch}%`
      )
      .order("full_name", { ascending: true })
      .limit(30);
    if (access.role !== "admin") {
      if (!scope.cellIds.length) {
        return NextResponse.json({ members: [] });
      }
      memberQuery = memberQuery.in("cell_id", scope.cellIds);
    }
    const { data: searchResults, error: searchError } = await memberQuery;
    if (searchError) {
      console.error("Erro ao pesquisar membros por requisito:", searchError);
      return NextResponse.json(
        { error: "Não foi possível pesquisar os membros." },
        { status: 500 }
      );
    }

    const answerByMember = new Map(
      answersResult.answers
        .filter((answer) => answer.requirement_id === requirementIdFilter)
        .map((answer) => [answer.member_id, answer])
    );
    const filteredMembers = searchResults.filter((member) => {
      if (!answerStatusFilter || !filterRequirement) {
        return true;
      }
      const answer = answerByMember.get(member.id);
      const complete =
        !!answer &&
        isFieldType(filterRequirement.field_type) &&
        answerIsComplete(answer, filterRequirement.field_type);
      return answerStatusFilter === "complete" ? complete : !complete;
    });

    return NextResponse.json({
      members: filteredMembers.map((member) => ({
        id: member.id,
        fullName: member.full_name,
        isActive: member.is_active,
      })),
    });
  }

  if (memberId) {
    const member = memberResult.members.find((entry) => entry.id === memberId);
    if (!member || !(await canAccessCell(access, member.cell_id))) {
      return NextResponse.json(
        { error: "Membro não encontrado ou sem permissão de acesso." },
        { status: 404 }
      );
    }

    const memberAnswers = answersResult.answers.filter(
      (answer) => answer.member_id === memberId
    );
    const responseIds = memberAnswers.map((answer) => answer.id);
    const [updaterResult, historyResult] = await Promise.all([
      [...new Set(memberAnswers.map((answer) => answer.updated_by).filter(Boolean))]
        .length
        ? access.adminClient
            .from("profiles")
            .select("id, full_name")
            .in(
              "id",
              [
                ...new Set(
                  memberAnswers.map((answer) => answer.updated_by).filter(Boolean)
                ),
              ]
            )
        : Promise.resolve({ data: [], error: null }),
      responseIds.length
        ? access.adminClient
            .from("audit_logs")
            .select("id, entity_id, action, metadata, created_at, profile_id")
            .eq("entity_type", "member_requirement")
            .in("entity_id", responseIds)
            .order("created_at", { ascending: false })
            .limit(500)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (updaterResult.error || historyResult.error) {
      console.error(
        "Erro ao carregar histórico de respostas:",
        updaterResult.error ?? historyResult.error
      );
      return NextResponse.json(
        { error: "Não foi possível carregar o histórico de respostas." },
        { status: 500 }
      );
    }

    const profileIds = [
      ...new Set([
        ...(updaterResult.data ?? []).map((profile) => profile.id),
        ...(historyResult.data ?? []).map((entry) => entry.profile_id),
      ]),
    ];
    const { data: historyProfiles, error: historyProfilesError } = profileIds.length
      ? await access.adminClient
          .from("profiles")
          .select("id, full_name")
          .in("id", profileIds)
      : { data: [], error: null };
    if (historyProfilesError) {
      console.error("Erro ao carregar responsáveis pelas respostas:", historyProfilesError);
      return NextResponse.json(
        { error: "Não foi possível carregar os responsáveis pelas respostas." },
        { status: 500 }
      );
    }
    const profileById = new Map(
      (historyProfiles ?? []).map((profile) => [profile.id, profile.full_name])
    );
    const answerByRequirementId = new Map(
      memberAnswers.map((answer) => [answer.requirement_id, answer])
    );
    const historyByResponseId = new Map<string, typeof historyResult.data>();
    for (const log of historyResult.data ?? []) {
      const logs = historyByResponseId.get(log.entity_id) ?? [];
      logs.push(log);
      historyByResponseId.set(log.entity_id, logs);
    }

    return NextResponse.json({
      requirements: requirements.map((requirement) => {
        const answer = answerByRequirementId.get(requirement.id);
        const answerHistory = answer
          ? (historyByResponseId.get(answer.id) ?? []).map((entry) => ({
              id: entry.id,
              action: entry.action,
              value:
                isRecord(entry.metadata) && "value" in entry.metadata
                  ? entry.metadata.value
                  : null,
              previousValue:
                isRecord(entry.metadata) && "previousValue" in entry.metadata
                  ? entry.metadata.previousValue
                  : null,
              createdAt: entry.created_at,
              updatedBy: profileById.get(entry.profile_id) ?? "Usuário",
            }))
          : [];
        const isCompletedValue = (value: unknown) => {
          if (requirement.field_type === "boolean") {
            return value === true;
          }
          return (
            (typeof value === "string" && value.trim().length > 0) ||
            typeof value === "number"
          );
        };
        const completionEntry = answerHistory.find((entry) => {
          return (
            isCompletedValue(entry.value) &&
            !isCompletedValue(entry.previousValue)
          );
        });
        return {
          id: requirement.id,
          title: requirement.title,
          description: requirement.description,
          fieldType: requirement.field_type,
          options: requirement.options,
          isRequired: requirement.is_required,
          isActive: requirement.is_active,
          createdAt: requirement.created_at,
          answer: answer
            ? {
                id: answer.id,
                value: isFieldType(requirement.field_type)
                  ? valueForField(answer, requirement.field_type)
                  : null,
                notes: answer.notes,
                updatedAt: answer.updated_at,
                completedAt:
                  completionEntry?.createdAt ??
                  (isFieldType(requirement.field_type) &&
                  answerIsComplete(answer, requirement.field_type)
                    ? answer.updated_at
                    : null),
                updatedBy: answer.updated_by
                  ? profileById.get(answer.updated_by) ?? "Usuário"
                  : "Usuário",
                history: answerHistory,
              }
            : null,
        };
      }),
      stats: {
        total: requirements.length,
        active: activeRequirements.length,
        completed: completedPairs.size,
        pending: Math.max(
          0,
          activeRequirements.filter((requirement) => requirement.is_required)
            .length *
            accessibleMemberIds.length -
            completedRequiredPairs.size
        ),
        members: accessibleMemberIds.length,
      },
      canManage: access.role === "admin",
      member: { id: member.id },
    });
  }

  const completedByRequirement = new Map<string, Set<string>>();
  for (const answer of completedAnswers) {
    const memberSet =
      completedByRequirement.get(answer.requirement_id) ?? new Set<string>();
    memberSet.add(answer.member_id);
    completedByRequirement.set(answer.requirement_id, memberSet);
  }
  const requiredSlots = activeRequirements
    .filter((requirement) => requirement.is_required)
    .length * accessibleMemberIds.length;

  return NextResponse.json({
    requirements: requirements.map((requirement) => {
      const completeCount =
        completedByRequirement.get(requirement.id)?.size ?? 0;
      return {
        id: requirement.id,
        title: requirement.title,
        description: requirement.description,
        fieldType: requirement.field_type,
        options: requirement.options,
        isRequired: requirement.is_required,
        isActive: requirement.is_active,
        createdAt: requirement.created_at,
        completedCount: completeCount,
        pendingCount: requirement.is_required
          ? Math.max(0, accessibleMemberIds.length - completeCount)
          : 0,
      };
    }),
    stats: {
      total: requirements.length,
      active: activeRequirements.length,
      completed: completedPairs.size,
      pending: Math.max(0, requiredSlots - completedRequiredPairs.size),
      members: accessibleMemberIds.length,
    },
    canManage: access.role === "admin",
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
      { error: "Envie os dados em formato JSON válido." },
      { status: 400 }
    );
  }
  if (!isRecord(body)) {
    return NextResponse.json(
      { error: "Os dados enviados são inválidos." },
      { status: 400 }
    );
  }

  if (body.action === "answer") {
    if (
      typeof body.memberId !== "string" ||
      typeof body.requirementId !== "string"
    ) {
      return NextResponse.json(
        { error: "Selecione o membro e o requisito." },
        { status: 400 }
      );
    }

    const { data: member, error: memberError } = await access.adminClient
      .from("members")
      .select("id, cell_id")
      .eq("id", body.memberId)
      .maybeSingle();
    if (memberError) {
      console.error("Erro ao verificar membro para resposta:", memberError);
      return NextResponse.json(
        { error: "Não foi possível verificar o membro." },
        { status: 500 }
      );
    }
    if (!member || !(await canAccessCell(access, member.cell_id))) {
      return NextResponse.json(
        { error: "Membro não encontrado ou sem permissão de acesso." },
        { status: 404 }
      );
    }

    const { data: requirement, error: requirementError } =
      await access.adminClient
        .from("requirements")
      .select("id, title, field_type, options, is_active, is_required")
        .eq("id", body.requirementId)
        .maybeSingle();
    if (requirementError) {
      console.error("Erro ao consultar requisito:", requirementError);
      return NextResponse.json(
        { error: "Não foi possível carregar o requisito." },
        { status: 500 }
      );
    }
    if (!requirement || !requirement.is_active) {
      return NextResponse.json(
        { error: "Este requisito não está ativo para receber respostas." },
        { status: 400 }
      );
    }
    if (!isFieldType(requirement.field_type)) {
      return NextResponse.json(
        { error: "O tipo deste requisito não é reconhecido." },
        { status: 409 }
      );
    }

    const parsedAnswer = parseAnswer(body, requirement);
    if (typeof parsedAnswer === "string") {
      return NextResponse.json({ error: parsedAnswer }, { status: 400 });
    }

    const { data: existingAnswers, error: existingError } =
      await access.adminClient
        .from("member_requirements")
        .select(
          "id, boolean_value, date_value, text_value, number_value, select_value"
        )
        .eq("member_id", member.id)
        .eq("requirement_id", requirement.id)
        .limit(2);
    if (existingError) {
      console.error("Erro ao verificar resposta existente:", existingError);
      return NextResponse.json(
        { error: "Não foi possível verificar a resposta existente." },
        { status: 500 }
      );
    }
    if (existingAnswers.length > 1) {
      return NextResponse.json(
        {
          error:
            "Há respostas duplicadas para este requisito. Solicite a revisão de um administrador.",
        },
        { status: 409 }
      );
    }

    const existing = existingAnswers[0] ?? null;
    const answerValues = {
      ...parsedAnswer.answer,
      member_id: member.id,
      requirement_id: requirement.id,
      notes: parsedAnswer.notes,
      updated_by: access.userId,
      updated_at: new Date().toISOString(),
    };
    let saved: { id: string } | null = null;
    let saveError: { code?: string; message: string } | null = null;
    if (existing) {
      const updateResult = await access.adminClient
        .from("member_requirements")
        .update(answerValues)
        .eq("id", existing.id)
        .select("id")
        .single();
      saved = updateResult.data;
      saveError = updateResult.error;
    } else {
      const insertResult = await access.adminClient
        .from("member_requirements")
        .insert(answerValues)
        .select("id")
        .single();
      saved = insertResult.data;
      saveError = insertResult.error;

      if (saveError?.code === "23505") {
        const { data: racedAnswers, error: raceLookupError } =
          await access.adminClient
            .from("member_requirements")
            .select("id")
            .eq("member_id", member.id)
            .eq("requirement_id", requirement.id)
            .limit(2);
        if (raceLookupError) {
          console.error("Erro ao consultar resposta concorrente:", raceLookupError);
          return NextResponse.json(
            { error: "Não foi possível verificar a resposta do membro." },
            { status: 500 }
          );
        }
        if (racedAnswers.length > 1) {
          return NextResponse.json(
            {
              error:
                "Há respostas duplicadas para este requisito. Solicite a revisão de um administrador.",
            },
            { status: 409 }
          );
        }
        const racedAnswer = racedAnswers[0];
        if (racedAnswer) {
          const retryResult = await access.adminClient
            .from("member_requirements")
            .update(answerValues)
            .eq("id", racedAnswer.id)
            .select("id")
            .single();
          saved = retryResult.data;
          saveError = retryResult.error;
        }
      }
    }
    if (saveError || !saved) {
      console.error("Erro ao salvar resposta de requisito:", saveError);
      return NextResponse.json(
        { error: "Não foi possível salvar a resposta." },
        { status: 500 }
      );
    }

    const auditRecorded = await writeAuditLog(access, {
      action: existing
        ? "member_requirement.answer_updated"
        : "member_requirement.answer_created",
      entityType: "member_requirement",
      entityId: saved.id,
      description: `Resposta de ${requirement.title} atualizada.`,
      metadata: {
        memberId: member.id,
        requirementId: requirement.id,
        previousValue: existing
          ? valueForField(existing, requirement.field_type)
          : null,
        value: valueForField(parsedAnswer.answer, requirement.field_type),
        notes: parsedAnswer.notes,
      },
    });

    return NextResponse.json({
      answerId: saved.id,
      warning: auditRecorded
        ? ""
        : "A resposta foi salva, mas o registro de auditoria falhou.",
    });
  }

  if (access.role !== "admin") {
    return NextResponse.json(
      { error: "Apenas administradores podem criar ou editar requisitos." },
      { status: 403 }
    );
  }

  const input = parseRequirementInput(body);
  if (typeof input === "string") {
    return NextResponse.json({ error: input }, { status: 400 });
  }

  const { data: requirement, error } = await access.adminClient
    .from("requirements")
    .insert({
      title: input.title,
      description: input.description,
      field_type: input.fieldType,
      options: input.options,
      is_required: input.isRequired,
      is_active: input.isActive,
      created_by: access.userId,
    })
    .select(
      "id, title, description, field_type, options, is_required, is_active, created_at"
    )
    .single();
  if (error || !requirement) {
    console.error("Erro ao cadastrar requisito:", error);
    return NextResponse.json(
      { error: "Não foi possível cadastrar o requisito." },
      { status: 500 }
    );
  }

  const auditRecorded = await writeAuditLog(access, {
    action: "requirement.created",
    entityType: "requirement",
    entityId: requirement.id,
    description: `Requisito ${requirement.title} cadastrado.`,
    metadata: {
      fieldType: input.fieldType,
      isRequired: input.isRequired,
      isActive: input.isActive,
    },
  });

  return NextResponse.json(
    {
      requirement: {
        id: requirement.id,
        title: requirement.title,
        description: requirement.description,
        fieldType: requirement.field_type,
        options: requirement.options,
        isRequired: requirement.is_required,
        isActive: requirement.is_active,
        createdAt: requirement.created_at,
      },
      warning: auditRecorded
        ? ""
        : "O requisito foi salvo, mas a auditoria falhou.",
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
  if (access.role !== "admin") {
    return NextResponse.json(
      { error: "Apenas administradores podem editar requisitos." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Envie os dados do requisito em formato JSON válido." },
      { status: 400 }
    );
  }
  if (!isRecord(body) || typeof body.id !== "string" || !body.id.trim()) {
    return NextResponse.json(
      { error: "Informe o requisito que deseja editar." },
      { status: 400 }
    );
  }

  const input = parseRequirementInput(body);
  if (typeof input === "string") {
    return NextResponse.json({ error: input }, { status: 400 });
  }

  const { data: current, error: currentError } = await access.adminClient
    .from("requirements")
    .select(
      "id, title, description, field_type, options, is_required, is_active"
    )
    .eq("id", body.id)
    .maybeSingle();
  if (currentError) {
    console.error("Erro ao consultar requisito para edição:", currentError);
    return NextResponse.json(
      { error: "Não foi possível carregar o requisito." },
      { status: 500 }
    );
  }
  if (!current) {
    return NextResponse.json(
      { error: "Requisito não encontrado." },
      { status: 404 }
    );
  }
  if (current.field_type !== input.fieldType) {
    const { data: existingAnswers, error: existingAnswersError } =
      await access.adminClient
        .from("member_requirements")
        .select("id")
        .eq("requirement_id", current.id)
        .limit(1);
    if (existingAnswersError) {
      console.error("Erro ao verificar respostas do requisito:", existingAnswersError);
      return NextResponse.json(
        { error: "Não foi possível verificar as respostas existentes." },
        { status: 500 }
      );
    }
    if (existingAnswers.length) {
      return NextResponse.json(
        {
          error:
            "Não é possível trocar o tipo de resposta de um requisito que já possui respostas. Desative-o e crie outro para preservar o histórico.",
        },
        { status: 409 }
      );
    }
  }
  if (
    input.fieldType === "select" &&
    current.field_type === "select" &&
    input.options
  ) {
    const { data: savedOptions, error: savedOptionsError } =
      await access.adminClient
        .from("member_requirements")
        .select("select_value")
        .eq("requirement_id", current.id)
        .not("select_value", "is", null);
    if (savedOptionsError) {
      console.error("Erro ao verificar opções já respondidas:", savedOptionsError);
      return NextResponse.json(
        { error: "Não foi possível verificar as respostas existentes." },
        { status: 500 }
      );
    }
    if (
      savedOptions.some(
        (answer) =>
          answer.select_value !== null &&
          !input.options?.includes(answer.select_value)
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Não é possível remover opções já utilizadas em respostas. Desative o requisito e crie outro para preservar o histórico.",
        },
        { status: 409 }
      );
    }
  }

  const { data: updated, error: updateError } = await access.adminClient
    .from("requirements")
    .update({
      title: input.title,
      description: input.description,
      field_type: input.fieldType,
      options: input.options,
      is_required: input.isRequired,
      is_active: input.isActive,
    })
    .eq("id", current.id)
    .select(
      "id, title, description, field_type, options, is_required, is_active, created_at"
    )
    .single();
  if (updateError || !updated) {
    console.error("Erro ao atualizar requisito:", updateError);
    return NextResponse.json(
      { error: "Não foi possível atualizar o requisito." },
      { status: 500 }
    );
  }

  const auditRecorded = await writeAuditLog(access, {
    action: "requirement.updated",
    entityType: "requirement",
    entityId: updated.id,
    description: `Requisito ${updated.title} atualizado.`,
    metadata: {
      previous: {
        title: current.title,
        fieldType: current.field_type,
        isRequired: current.is_required,
        isActive: current.is_active,
      },
      updated: {
        title: updated.title,
        fieldType: updated.field_type,
        isRequired: updated.is_required,
        isActive: updated.is_active,
      },
    },
  });

  return NextResponse.json({
    requirement: {
      id: updated.id,
      title: updated.title,
      description: updated.description,
      fieldType: updated.field_type,
      options: updated.options,
      isRequired: updated.is_required,
      isActive: updated.is_active,
      createdAt: updated.created_at,
    },
    warning: auditRecorded
      ? ""
      : "O requisito foi atualizado, mas a auditoria falhou.",
  });
}
