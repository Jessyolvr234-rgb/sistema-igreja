
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function authorizeAdmin() {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims) {
    return {
      response: NextResponse.json(
        { error: "Você precisa estar autenticado." },
        { status: 401 }
      ),
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", claimsData.claims.sub)
    .maybeSingle();

  if (profileError) {
    console.error("Erro ao verificar permissão de administrador:", profileError);
    return {
      response: NextResponse.json(
        { error: "Não foi possível verificar sua permissão." },
        { status: 500 }
      ),
    };
  }

  if (!profile || profile.role !== "admin" || !profile.is_active) {
    return {
      response: NextResponse.json(
        { error: "Apenas o administrador pode gerenciar usuários." },
        { status: 403 }
      ),
    };
  }

  return {
    adminClient: createAdminClient(),
    userId: claimsData.claims.sub,
  };
}

export async function GET() {
  const authorization = await authorizeAdmin();

  if ("response" in authorization) {
    return authorization.response;
  }

  const { data, error } = await authorization.adminClient
    .from("profiles")
    .select("id, full_name, email, role, is_active")
    .order("full_name", { ascending: true });

  if (error) {
    console.error("Erro ao listar usuários:", error);
    return NextResponse.json(
      { error: "Não foi possível carregar os usuários." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    users: data.map((profile) => ({
      id: profile.id,
      fullName: profile.full_name,
      email: profile.email,
      role: profile.role,
      isActive: profile.is_active,
    })),
  });
}

export async function POST(request: Request) {
  const authorization = await authorizeAdmin();

  if ("response" in authorization) {
    return authorization.response;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Envie os dados do usuário em formato JSON válido." },
      { status: 400 }
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { error: "Os dados enviados são inválidos." },
      { status: 400 }
    );
  }

  const input = body as Record<string, unknown>;
  const fullName =
    typeof input.fullName === "string" ? input.fullName.trim() : "";
  const email =
    typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";
  const role = input.role;

  if (!fullName || !email || !password) {
    return NextResponse.json(
      { error: "Preencha todos os campos." },
      { status: 400 }
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "Informe um e-mail válido." },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "A senha precisa ter pelo menos 8 caracteres." },
      { status: 400 }
    );
  }

  if (role !== "supervisor" && role !== "leader") {
    return NextResponse.json(
      { error: "Perfil de acesso inválido." },
      { status: 400 }
    );
  }

  const { data: authData, error: authError } =
    await authorization.adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (authError || !authData.user) {
    return NextResponse.json(
      { error: authError?.message ?? "Não foi possível criar o usuário." },
      { status: 400 }
    );
  }

  const { error: insertError } = await authorization.adminClient
    .from("profiles")
    .insert({
      id: authData.user.id,
      full_name: fullName,
      email,
      role,
      is_active: true,
    });

  if (insertError) {
    const { error: rollbackError } =
      await authorization.adminClient.auth.admin.deleteUser(authData.user.id);

    if (rollbackError) {
      console.error("Erro ao desfazer criação de usuário:", rollbackError);
    }

    console.error("Erro ao salvar perfil de usuário:", insertError);
    return NextResponse.json(
      { error: "O usuário foi criado, mas o perfil não pôde ser salvo." },
      { status: 500 }
    );
  }

  const { error: auditError } = await authorization.adminClient
    .from("audit_logs")
    .insert({
      profile_id: authorization.userId,
      action: "create",
      entity_type: "profile",
      entity_id: authData.user.id,
      description: `Cadastrou o usuário ${fullName}.`,
      metadata: { role },
      created_at: new Date().toISOString(),
    });
  if (auditError) {
    console.error("Erro ao registrar auditoria de criação de usuário:", auditError);
    return NextResponse.json(
      { error: "O usuário foi criado, mas a auditoria não foi registrada." },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      message: "Usuário cadastrado com sucesso.",
      user: {
        id: authData.user.id,
        fullName,
        email,
        role,
        isActive: true,
      },
    },
    { status: 201 }
  );
}

export async function PATCH(request: Request) {
  const authorization = await authorizeAdmin();

  if ("response" in authorization) {
    return authorization.response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Envie os dados do usuário em formato JSON válido." },
      { status: 400 }
    );
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { error: "Os dados enviados são inválidos." },
      { status: 400 }
    );
  }

  const input = body as Record<string, unknown>;
  const userId = typeof input.userId === "string" ? input.userId : "";
  const isActive = input.isActive;
  const role = input.role;
  if (
    !userId ||
    (isActive === undefined && role === undefined) ||
    (isActive !== undefined && typeof isActive !== "boolean") ||
    (role !== undefined && role !== "supervisor" && role !== "leader")
  ) {
    return NextResponse.json(
      { error: "Informe um usuário e alterações válidas." },
      { status: 400 }
    );
  }
  if (userId === authorization.userId) {
    return NextResponse.json(
      { error: "Você não pode alterar seu próprio acesso." },
      { status: 403 }
    );
  }

  const { data: target, error: targetError } = await authorization.adminClient
    .from("profiles")
    .select("id, full_name, role, is_active")
    .eq("id", userId)
    .maybeSingle();
  if (targetError) {
    console.error("Erro ao consultar usuário para atualização:", targetError);
    return NextResponse.json(
      { error: "Não foi possível verificar o usuário selecionado." },
      { status: 500 }
    );
  }
  if (!target || (target.role !== "supervisor" && target.role !== "leader")) {
    return NextResponse.json(
      { error: "Este usuário não pode ser alterado por esta tela." },
      { status: 403 }
    );
  }

  const changes: { is_active?: boolean; role?: "supervisor" | "leader" } = {};
  if (typeof isActive === "boolean") {
    changes.is_active = isActive;
  }
  if (role === "supervisor" || role === "leader") {
    changes.role = role;
  }

  const { error: updateError } = await authorization.adminClient
    .from("profiles")
    .update(changes)
    .eq("id", userId);
  if (updateError) {
    console.error("Erro ao atualizar usuário:", updateError);
    return NextResponse.json(
      { error: "Não foi possível atualizar o usuário." },
      { status: 500 }
    );
  }

  const changedFields = Object.keys(changes);
  const { error: auditError } = await authorization.adminClient
    .from("audit_logs")
    .insert({
      profile_id: authorization.userId,
      action: "update",
      entity_type: "profile",
      entity_id: userId,
      description: `Atualizou o acesso de ${target.full_name}.`,
      metadata: {
        previous: { role: target.role, isActive: target.is_active },
        changes,
      },
    });
  if (auditError) {
    console.error("Erro ao registrar auditoria de usuário:", auditError);
    return NextResponse.json(
      { error: "O acesso foi atualizado, mas a auditoria não foi registrada." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    message: "Usuário atualizado com sucesso.",
    user: {
      id: target.id,
      fullName: target.full_name,
      role: changes.role ?? target.role,
      isActive: changes.is_active ?? target.is_active,
    },
    changedFields,
  });
}
