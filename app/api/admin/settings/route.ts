import { NextResponse } from "next/server";
import {
  getDashboardAccess,
  type DashboardAccess,
} from "@/lib/supabase/dashboard-access";
import { writeAuditLog } from "@/lib/supabase/audit";

const SETTING_KEYS = {
  church: "church_profile",
  preferences: "system_preferences",
} as const;

type SettingsSection = keyof typeof SETTING_KEYS;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function accessFailure(
  result: Extract<Awaited<ReturnType<typeof getDashboardAccess>>, { ok: false }>
) {
  return NextResponse.json({ error: result.error }, { status: result.status });
}

async function authorizeSettings() {
  const result = await getDashboardAccess();
  if (!result.ok) {
    return { response: accessFailure(result) };
  }
  if (result.access.role !== "admin") {
    return {
      response: NextResponse.json(
        { error: "Apenas administradores podem acessar as configurações." },
        { status: 403 }
      ),
    };
  }
  return { access: result.access };
}

export async function GET(request: Request) {
  const authorization = await authorizeSettings();
  if ("response" in authorization) {
    return authorization.response;
  }

  const { access } = authorization;
  const params = new URL(request.url).searchParams;
  const page = Math.max(1, Math.min(10000, Number(params.get("page")) || 1));
  const pageSize = 25;

  const [settingsResult, usersResult, auditResult] = await Promise.all([
    access.adminClient
      .from("system_settings")
      .select("setting_key, setting_value")
      .in("setting_key", Object.values(SETTING_KEYS)),
    access.adminClient
      .from("profiles")
      .select("id, full_name, email, role, is_active")
      .order("full_name", { ascending: true }),
    access.adminClient
      .from("audit_logs")
      .select(
        "id, profile_id, action, entity_type, entity_id, description, created_at",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1),
  ]);

  if (settingsResult.error || usersResult.error || auditResult.error) {
    console.error("Erro ao carregar configurações administrativas:", {
      settings: settingsResult.error,
      users: usersResult.error,
      audit: auditResult.error,
    });
    return NextResponse.json(
      { error: "Não foi possível carregar as configurações administrativas." },
      { status: 500 }
    );
  }

  const settingsByKey = new Map(
    settingsResult.data.map((setting) => [
      setting.setting_key,
      isRecord(setting.setting_value) ? setting.setting_value : {},
    ])
  );
  const profileIds = [
    ...new Set(
      (auditResult.data ?? [])
        .map((entry) => entry.profile_id)
        .filter((id): id is string => !!id)
    ),
  ];
  const { data: profiles, error: profilesError } = profileIds.length
    ? await access.adminClient
        .from("profiles")
        .select("id, full_name")
        .in("id", profileIds)
    : { data: [], error: null };

  if (profilesError) {
    console.error("Erro ao carregar responsáveis da auditoria:", profilesError);
    return NextResponse.json(
      { error: "Não foi possível carregar os responsáveis da auditoria." },
      { status: 500 }
    );
  }

  const namesById = new Map(
    (profiles ?? []).map((profile) => [profile.id, profile.full_name])
  );

  return NextResponse.json({
    currentUserId: access.userId,
    church: settingsByKey.get(SETTING_KEYS.church) ?? {},
    preferences: settingsByKey.get(SETTING_KEYS.preferences) ?? {},
    users: usersResult.data.map((profile) => ({
      id: profile.id,
      fullName: profile.full_name,
      email: profile.email,
      role: profile.role,
      isActive: profile.is_active,
    })),
    audit: {
      entries: (auditResult.data ?? []).map((entry) => ({
        id: entry.id,
        userName: entry.profile_id
          ? namesById.get(entry.profile_id) ?? "Usuário removido"
          : "Sistema",
        action: entry.action,
        entityType: entry.entity_type,
        entityId: entry.entity_id,
        description: entry.description,
        createdAt: entry.created_at,
      })),
      page,
      pageSize,
      total: auditResult.count ?? 0,
    },
  });
}

function validateSettings(
  section: SettingsSection,
  values: Record<string, unknown>
): string | null {
  const allowedFields =
    section === "church"
      ? ["name", "cnpj", "phone", "email", "address", "logoUrl", "description"]
      : [
          "meetingDay",
          "meetingTime",
          "notificationsEnabled",
          "compactDisplay",
          "defaultReportPeriod",
        ];

  if (Object.keys(values).some((key) => !allowedFields.includes(key))) {
    return "As configurações enviadas contêm campos não permitidos.";
  }

  if (section === "church") {
    const textLimits: Record<string, number> = {
      name: 180,
      cnpj: 32,
      phone: 40,
      email: 254,
      address: 500,
      logoUrl: 2000,
      description: 2000,
    };
    for (const [key, limit] of Object.entries(textLimits)) {
      const value = values[key];
      if (value !== undefined && (typeof value !== "string" || value.length > limit)) {
        return `O campo ${key} é inválido ou excede o limite permitido.`;
      }
    }
    const email = values.email;
    if (
      typeof email === "string" &&
      email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      return "Informe um e-mail institucional válido.";
    }
  } else {
    if (
      values.meetingDay !== undefined &&
      ![
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
      ].includes(String(values.meetingDay))
    ) {
      return "Selecione um dia da semana válido.";
    }
    if (
      values.meetingTime !== undefined &&
      (typeof values.meetingTime !== "string" ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(values.meetingTime))
    ) {
      return "Informe um horário válido.";
    }
    if (
      values.notificationsEnabled !== undefined &&
      typeof values.notificationsEnabled !== "boolean"
    ) {
      return "A preferência de notificações é inválida.";
    }
    if (
      values.compactDisplay !== undefined &&
      typeof values.compactDisplay !== "boolean"
    ) {
      return "A preferência de exibição é inválida.";
    }
    if (
      values.defaultReportPeriod !== undefined &&
      ![1, 3, 6, 12].includes(Number(values.defaultReportPeriod))
    ) {
      return "Selecione um período padrão válido para relatórios.";
    }
  }

  return null;
}

async function saveSetting(
  access: DashboardAccess,
  section: SettingsSection,
  values: Record<string, unknown>
) {
  const settingKey = SETTING_KEYS[section];
  const { data: existing, error: lookupError } = await access.adminClient
    .from("system_settings")
    .select("id")
    .eq("setting_key", settingKey)
    .maybeSingle();

  if (lookupError) {
    console.error("Erro ao consultar configuração:", lookupError);
    return { error: "Não foi possível consultar a configuração atual." };
  }

  const result = existing
    ? await access.adminClient
        .from("system_settings")
        .update({
          setting_value: values,
          updated_by: access.userId,
        })
        .eq("id", existing.id)
    : await access.adminClient.from("system_settings").insert({
        setting_key: settingKey,
        setting_value: values,
        description:
          section === "church"
            ? "Dados institucionais da igreja"
            : "Preferências gerais do sistema",
        updated_by: access.userId,
      });

  if (result.error) {
    console.error("Erro ao salvar configuração:", result.error);
    return { error: "Não foi possível salvar as configurações." };
  }
  return { error: null };
}

export async function PUT(request: Request) {
  const authorization = await authorizeSettings();
  if ("response" in authorization) {
    return authorization.response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Envie os dados em formato JSON válido." },
      { status: 400 }
    );
  }
  if (!isRecord(body) || !isRecord(body.values)) {
    return NextResponse.json(
      { error: "As configurações enviadas são inválidas." },
      { status: 400 }
    );
  }
  const section = body.section;
  if (section !== "church" && section !== "preferences") {
    return NextResponse.json(
      { error: "Selecione uma seção de configuração válida." },
      { status: 400 }
    );
  }
  const validationError = validateSettings(section, body.values);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const { access } = authorization;
  const saved = await saveSetting(access, section, body.values);
  if (saved.error) {
    return NextResponse.json({ error: saved.error }, { status: 500 });
  }
  const logged = await writeAuditLog(access, {
    action: "update",
    entityType: "system_settings",
    entityId: SETTING_KEYS[section],
    description:
      section === "church"
        ? "Atualizou os dados institucionais da igreja."
        : "Atualizou as preferências do sistema.",
    metadata: { section },
  });
  if (!logged) {
    return NextResponse.json(
      { error: "As configurações foram salvas, mas a auditoria não foi registrada." },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: "Configurações salvas com sucesso." });
}
