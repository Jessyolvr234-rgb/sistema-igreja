"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import styles from "./dashboard.module.css";
import profileStyles from "./profile.module.css";

type UserProfile = {
  fullName: string;
  email: string;
  role: "admin" | "supervisor" | "leader";
  avatarUrl: string | null;
};

const roleLabels: Record<UserProfile["role"], string> = {
  admin: "Administrador",
  supervisor: "Supervisor",
  leader: "Líder",
};

function getInitials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "U"
  );
}

export default function ProfileManagement() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [fullName, setFullName] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/dashboard/profile", { signal: controller.signal })
      .then(async (response) => {
        const result = (await response.json()) as {
          profile?: UserProfile;
          error?: string;
        };
        if (!response.ok || !result.profile) {
          throw new Error(result.error ?? "Não foi possível carregar seu perfil.");
        }
        setProfile(result.profile);
        setFullName(result.profile.fullName);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível carregar seu perfil."
        );
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl]
  );

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setError("");
    setSuccess("");

    if (file && file.size > 3 * 1024 * 1024) {
      setError("A foto deve ter no máximo 3 MB.");
      event.target.value = "";
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedPhoto(file);
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!fullName.trim()) {
      setError("Informe seu nome.");
      return;
    }

    const formData = new FormData();
    formData.set("fullName", fullName.trim());
    if (selectedPhoto) formData.set("avatar", selectedPhoto);

    setSaving(true);
    try {
      const response = await fetch("/api/dashboard/profile", {
        method: "PATCH",
        body: formData,
      });
      const result = (await response.json()) as {
        profile?: UserProfile;
        error?: string;
      };
      if (!response.ok || !result.profile) {
        throw new Error(result.error ?? "Não foi possível salvar seu perfil.");
      }

      setProfile(result.profile);
      setFullName(result.profile.fullName);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setSelectedPhoto(null);
      setPreviewUrl(null);
      setSuccess("Seu perfil foi atualizado.");
      window.dispatchEvent(
        new CustomEvent("dashboard-profile-updated", {
          detail: result.profile,
        })
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar seu perfil."
      );
    } finally {
      setSaving(false);
    }
  }

  const imageUrl = previewUrl ?? profile?.avatarUrl ?? null;
  const initials = getInitials(fullName || profile?.email || "");

  return (
    <section className={`${styles.modulePage} ${profileStyles.profilePage}`}>
      <header className={styles.moduleHeading}>
        <div>
          <span className={styles.moduleEyebrow}>MINHA CONTA</span>
          <h1>Meu perfil</h1>
          <p>Gerencie suas informações e sua foto de perfil.</p>
        </div>
      </header>

      {error && (
        <div className={styles.moduleError} role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className={styles.moduleSuccess} role="status">
          {success}
        </div>
      )}

      {loading ? (
        <div className={profileStyles.loading} role="status">
          Carregando perfil...
        </div>
      ) : (
        <form className={profileStyles.profileCard} onSubmit={saveProfile}>
          <div className={profileStyles.profileSummary}>
            <div className={profileStyles.avatarWrap}>
              {imageUrl ? (
                <Image
                  src={imageUrl}
                  alt="Foto de perfil"
                  fill
                  sizes="112px"
                  unoptimized
                  className={profileStyles.profileAvatar}
                />
              ) : (
                <span className={profileStyles.profileInitials}>{initials}</span>
              )}
            </div>
            <div className={profileStyles.profileIdentity}>
              <strong>{fullName || profile?.email}</strong>
              <span>{profile ? roleLabels[profile.role] : ""}</span>
              {profile?.email && <small>{profile.email}</small>}
            </div>
          </div>

          <div className={profileStyles.profileFields}>
            <label className={styles.moduleField}>
              <span>Nome</span>
              <input
                autoComplete="name"
                maxLength={120}
                onChange={(event) => setFullName(event.target.value)}
                required
                value={fullName}
              />
            </label>

            <label className={styles.moduleField}>
              <span>E-mail</span>
              <input
                autoComplete="email"
                readOnly
                value={profile?.email ?? ""}
              />
              <small>O e-mail da conta não pode ser alterado nesta tela.</small>
            </label>

            <div className={profileStyles.photoField}>
              <span className={profileStyles.fieldLabel}>Foto de perfil</span>
              <p>Escolha uma imagem JPG, PNG ou WEBP de até 3 MB.</p>
              <input
                accept="image/jpeg,image/png,image/webp"
                className={profileStyles.fileInput}
                onChange={choosePhoto}
                ref={inputRef}
                type="file"
              />
              <button
                className={styles.moduleSecondaryButton}
                onClick={() => inputRef.current?.click()}
                type="button"
              >
                {selectedPhoto ? "Escolher outra foto" : "Adicionar foto"}
              </button>
              {selectedPhoto && (
                <span className={profileStyles.fileName}>
                  {selectedPhoto.name}
                </span>
              )}
            </div>
          </div>

          <div className={styles.moduleFormActions}>
            <button
              className={styles.modulePrimaryButton}
              disabled={saving}
              type="submit"
            >
              {saving ? "Salvando..." : "Salvar perfil"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
