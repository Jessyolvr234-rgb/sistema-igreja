"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "../criar-conta/signup.module.css";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (password.length < 8) {
      setError("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        setError(
          "Não foi possível redefinir a senha. Solicite um novo link de recuperação e tente novamente."
        );
        return;
      }

      setPassword("");
      setConfirmPassword("");
      setSuccess("Sua senha foi redefinida. Você já pode entrar com a nova senha.");
    } catch (cause) {
      console.error("Erro ao redefinir senha:", cause);
      setError("Ocorreu um erro ao redefinir a senha. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.brandPanel}>
        <Link aria-label="Rede Êmaús, página inicial" className={styles.brand} href="/">
          <Image
            alt="Rede Emaús"
            height={84}
            priority
            src="/rede-emaus.png"
            width={188}
          />
          <span>Gestão Igreja | Administração</span>
        </Link>
        <div className={styles.brandMessage}>
          <span>REDE ÊMAUS</span>
          <h1>Recupere o acesso à sua conta.</h1>
          <p>Cadastre uma nova senha para continuar usando a plataforma.</p>
        </div>
        <small className={styles.brandFooter}>Acesso seguro à Rede Êmaús.</small>
      </section>

      <section className={styles.formPanel}>
        <div className={styles.formCard}>
          <Link className={styles.backLink} href="/entrar">
            ← Voltar para entrar
          </Link>
          <div className={styles.heading}>
            <span>RECUPERAÇÃO DE ACESSO</span>
            <h2>Redefinir senha</h2>
            <p>Escolha uma nova senha para sua conta.</p>
          </div>

          {error && (
            <div className={styles.error} role="alert">
              {error}
            </div>
          )}
          {success && (
            <div className={styles.success} role="status">
              <span>{success}</span>
              <Link href="/entrar">Ir para entrar</Link>
            </div>
          )}

          {!success && (
            <form className={styles.form} onSubmit={submit}>
              <label>
                <span>Nova senha</span>
                <span className={styles.passwordInput}>
                  <input
                    autoComplete="new-password"
                    minLength={8}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Mínimo de 8 caracteres"
                    required
                    type={showPassword ? "text" : "password"}
                    value={password}
                  />
                  <button
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    onClick={() => setShowPassword((value) => !value)}
                    type="button"
                  >
                    {showPassword ? "Ocultar" : "Mostrar"}
                  </button>
                </span>
              </label>

              <label>
                <span>Confirmar nova senha</span>
                <input
                  autoComplete="new-password"
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Digite novamente sua senha"
                  required
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                />
              </label>

              <button className={styles.submitButton} disabled={saving} type="submit">
                {saving ? "Salvando..." : "Salvar nova senha"}
              </button>
            </form>
          )}

          <div className={styles.loginLink}>
            Não recebeu o link? <Link href="/entrar">Solicitar novamente</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
