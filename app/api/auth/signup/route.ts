import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Envie os dados do cadastro em formato JSON válido." },
      { status: 400 }
    );
  }

  if (!isRecord(body)) {
    return NextResponse.json(
      { error: "Os dados enviados são inválidos." },
      { status: 400 }
    );
  }

  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!fullName || fullName.length > 120 || !email || !password) {
    return NextResponse.json(
      { error: "Preencha os campos obrigatórios com dados válidos." },
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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) {
    console.error("As variáveis públicas do Supabase não estão configuradas.");
    return NextResponse.json(
      { error: "O cadastro está temporariamente indisponível." },
      { status: 500 }
    );
  }

  const publicClient = createSupabaseClient(supabaseUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  const { data: signupData, error: signupError } =
    await publicClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
        emailRedirectTo: new URL("/acesso-pendente", request.url).toString(),
      },
    });

  if (signupError) {
    if (signupError.code === "user_already_exists") {
      return NextResponse.json(
        {
          error:
            "Este e-mail já possui uma conta. Tente entrar ou recuperar sua senha.",
        },
        { status: 409 }
      );
    }

    console.error("Erro no cadastro público do Supabase:", signupError);
    return NextResponse.json(
      { error: "Não foi possível criar a conta. Verifique os dados e tente novamente." },
      { status: 400 }
    );
  }

  const user = signupData.user;
  if (!user || !user.id) {
    return NextResponse.json(
      { error: "Não foi possível confirmar a criação da conta." },
      { status: 500 }
    );
  }

  if (!user.identities?.length) {
    return NextResponse.json(
      {
        error:
          "Este e-mail já possui uma conta. Tente entrar ou recuperar sua senha.",
      },
      { status: 409 }
    );
  }

  const adminClient = createAdminClient();
  const { error: approvalMetadataError } =
    await adminClient.auth.admin.updateUserById(user.id, {
      app_metadata: {
        ...user.app_metadata,
        approval_status: "pending",
      },
    });

  if (approvalMetadataError) {
    console.error(
      "Erro ao marcar solicitação como pendente:",
      approvalMetadataError
    );
    const { error: rollbackError } = await adminClient.auth.admin.deleteUser(
      user.id
    );
    if (rollbackError) {
      console.error("Erro ao desfazer cadastro público:", rollbackError);
    }
    return NextResponse.json(
      { error: "Não foi possível registrar a solicitação de acesso." },
      { status: 500 }
    );
  }

  const { error: profileError } = await adminClient.from("profiles").insert({
    id: user.id,
    full_name: fullName,
    email,
    role: "leader",
    is_active: false,
  });

  if (profileError) {
    console.error("Erro ao criar perfil pendente:", profileError);
    const { error: rollbackError } =
      await adminClient.auth.admin.deleteUser(user.id);
    if (rollbackError) {
      console.error("Erro ao desfazer cadastro público:", rollbackError);
    }
    return NextResponse.json(
      { error: "A conta foi iniciada, mas não foi possível registrar a solicitação." },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      message:
        "Solicitação recebida. Confirme seu e-mail, se solicitado, e aguarde a aprovação da administração.",
      emailConfirmationRequired: !signupData.session,
    },
    { status: 201 }
  );
}
