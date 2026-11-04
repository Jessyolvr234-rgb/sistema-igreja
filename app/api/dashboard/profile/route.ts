import { NextResponse } from "next/server";
import { getDashboardAccess } from "@/lib/supabase/dashboard-access";

const AVATAR_BUCKET = "user-avatars";
const MAX_AVATAR_SIZE = 3 * 1024 * 1024;
const SIGNED_URL_TTL = 60 * 60 * 24 * 7;

function isOwnedAvatarPath(value: unknown, userId: string): value is string {
  return (
    typeof value === "string" &&
    value.startsWith(`${userId}/`) &&
    !value.includes("..")
  );
}

function getImageExtension(file: File, bytes: Uint8Array) {
  const isPng =
    file.type === "image/png" &&
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;

  const isJpeg =
    file.type === "image/jpeg" &&
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff;

  const isWebp =
    file.type === "image/webp" &&
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";

  if (isPng) return "png";
  if (isJpeg) return "jpg";
  if (isWebp) return "webp";
  return null;
}

async function getAvatarUrl(
  adminClient: ReturnType<
    typeof import("@/lib/supabase/admin").createAdminClient
  >,
  avatarPath: unknown,
  userId: string
) {
  if (avatarPath == null) return null;
  if (!isOwnedAvatarPath(avatarPath, userId)) {
    throw new Error("O caminho da foto de perfil não é válido.");
  }

  const { data, error } = await adminClient.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(avatarPath, SIGNED_URL_TTL);

  if (error || !data?.signedUrl) {
    console.error("Erro ao gerar URL da foto de perfil:", error);
    throw new Error("Não foi possível carregar sua foto de perfil.");
  }

  return data.signedUrl;
}

export async function GET() {
  const result = await getDashboardAccess();
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { access } = result;
  const [{ data: profile, error: profileError }, { data: authResult, error: authError }] =
    await Promise.all([
      access.adminClient
        .from("profiles")
        .select("full_name, email, role")
        .eq("id", access.userId)
        .maybeSingle(),
      access.adminClient.auth.admin.getUserById(access.userId),
    ]);

  if (profileError || authError || !profile || !authResult.user) {
    console.error("Erro ao carregar perfil do usuário:", {
      profileError,
      authError,
    });
    return NextResponse.json(
      { error: "Não foi possível carregar seu perfil." },
      { status: 500 }
    );
  }

  try {
    const avatarUrl = await getAvatarUrl(
      access.adminClient,
      authResult.user.user_metadata?.avatar_path,
      access.userId
    );

    return NextResponse.json({
      profile: {
        fullName: profile.full_name,
        email: profile.email,
        role: profile.role,
        avatarUrl,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível carregar sua foto de perfil.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const result = await getDashboardAccess();
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { access } = result;
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Envie os dados do perfil em um formulário válido." },
      { status: 400 }
    );
  }

  const fullName = formData.get("fullName");
  const avatarEntry = formData.get("avatar");
  const avatarFile =
    avatarEntry instanceof File && avatarEntry.size > 0 ? avatarEntry : null;

  if (
    typeof fullName !== "string" ||
    !fullName.trim() ||
    fullName.trim().length > 120
  ) {
    return NextResponse.json(
      { error: "Informe um nome com até 120 caracteres." },
      { status: 400 }
    );
  }

  if (avatarEntry && typeof avatarEntry !== "string" && !avatarFile) {
    return NextResponse.json(
      { error: "O arquivo enviado não é válido." },
      { status: 400 }
    );
  }

  if (avatarFile && avatarFile.size > MAX_AVATAR_SIZE) {
    return NextResponse.json(
      { error: "A foto deve ter no máximo 3 MB." },
      { status: 400 }
    );
  }

  let uploadedPath: string | null = null;
  let previousAvatarPath: string | null = null;
  let previousMetadata: Record<string, unknown> = {};

  const { data: authResult, error: authError } =
    await access.adminClient.auth.admin.getUserById(access.userId);

  if (authError || !authResult.user) {
    console.error("Erro ao consultar usuário para atualizar perfil:", authError);
    return NextResponse.json(
      { error: "Não foi possível validar seu usuário." },
      { status: 500 }
    );
  }

  const { data: existingProfile, error: existingProfileError } =
    await access.adminClient
      .from("profiles")
      .select("full_name")
      .eq("id", access.userId)
      .maybeSingle();

  if (existingProfileError || !existingProfile) {
    console.error(
      "Erro ao consultar nome anterior do perfil:",
      existingProfileError
    );
    return NextResponse.json(
      { error: "Não foi possível carregar os dados atuais do perfil." },
      { status: 500 }
    );
  }

  previousMetadata = authResult.user.user_metadata ?? {};
  const existingPath = previousMetadata.avatar_path;
  if (isOwnedAvatarPath(existingPath, access.userId)) {
    previousAvatarPath = existingPath;
  }

  let avatarExtension: string | null = null;
  let avatarBytes: Uint8Array | null = null;
  if (avatarFile) {
    avatarBytes = new Uint8Array(await avatarFile.arrayBuffer());
    avatarExtension = getImageExtension(avatarFile, avatarBytes);
    if (!avatarExtension) {
      return NextResponse.json(
        { error: "Use uma imagem JPG, PNG ou WEBP válida." },
        { status: 400 }
      );
    }

    const { data: buckets, error: bucketsError } =
      await access.adminClient.storage.listBuckets();
    if (bucketsError) {
      console.error("Erro ao consultar armazenamento de fotos:", bucketsError);
      return NextResponse.json(
        { error: "Não foi possível preparar o armazenamento da foto." },
        { status: 500 }
      );
    }

    if (!buckets.some((bucket) => bucket.name === AVATAR_BUCKET)) {
      const { error: createBucketError } =
        await access.adminClient.storage.createBucket(AVATAR_BUCKET, {
          public: false,
          fileSizeLimit: MAX_AVATAR_SIZE,
          allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
        });

      if (createBucketError) {
        console.error(
          "Erro ao criar armazenamento de fotos:",
          createBucketError
        );
        return NextResponse.json(
          { error: "Não foi possível preparar o armazenamento da foto." },
          { status: 500 }
        );
      }
    }

    uploadedPath = `${access.userId}/${crypto.randomUUID()}.${avatarExtension}`;
    const { error: uploadError } = await access.adminClient.storage
      .from(AVATAR_BUCKET)
      .upload(uploadedPath, avatarBytes, {
        contentType: avatarFile.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Erro ao salvar foto do perfil:", uploadError);
      return NextResponse.json(
        { error: "Não foi possível salvar sua foto." },
        { status: 500 }
      );
    }
  }

  const { error: profileUpdateError } = await access.adminClient
    .from("profiles")
    .update({ full_name: fullName.trim() })
    .eq("id", access.userId);

  if (profileUpdateError) {
    console.error("Erro ao atualizar nome do perfil:", profileUpdateError);
    if (uploadedPath) {
      await access.adminClient.storage.from(AVATAR_BUCKET).remove([uploadedPath]);
    }
    return NextResponse.json(
      { error: "Não foi possível atualizar seu nome." },
      { status: 500 }
    );
  }

  if (uploadedPath) {
    const { error: metadataError } =
      await access.adminClient.auth.admin.updateUserById(access.userId, {
        user_metadata: {
          ...previousMetadata,
          avatar_path: uploadedPath,
        },
      });

    if (metadataError) {
      console.error("Erro ao associar foto ao perfil:", metadataError);
      const { error: rollbackError } = await access.adminClient
        .from("profiles")
        .update({ full_name: existingProfile.full_name })
        .eq("id", access.userId);
      if (rollbackError) {
        console.error("Erro ao restaurar nome do perfil:", rollbackError);
      }
      await access.adminClient.storage.from(AVATAR_BUCKET).remove([uploadedPath]);
      return NextResponse.json(
        { error: "Não foi possível associar a foto ao seu perfil." },
        { status: 500 }
      );
    }
  }

  if (uploadedPath && previousAvatarPath) {
    const { error: removeError } = await access.adminClient.storage
      .from(AVATAR_BUCKET)
      .remove([previousAvatarPath]);
    if (removeError) {
      console.error("Erro ao remover foto de perfil anterior:", removeError);
    }
  }

  const avatarPath = uploadedPath ?? previousAvatarPath;
  let avatarUrl: string | null;
  try {
    avatarUrl = await getAvatarUrl(
      access.adminClient,
      avatarPath,
      access.userId
    );
  } catch (error) {
    console.error("Erro ao preparar foto atualizada:", error);
    return NextResponse.json(
      { error: "O perfil foi atualizado, mas não foi possível carregar a foto." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    profile: {
      fullName: fullName.trim(),
      email: authResult.user.email ?? "",
      role: access.role,
      avatarUrl,
    },
  });
}
