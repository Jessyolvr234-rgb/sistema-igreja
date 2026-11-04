"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import styles from "./signup.module.css";

type SignupResult = {
  message?: string;
  error?: string;
};

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
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

    if (fullName.trim().length < 2) {
      setError("Informe seu nome completo.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Digite um endereço de e-mail válido.");
      return;
    }
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
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim(),
          password,
        }),
      });
      const result = (await response.json()) as SignupResult;
      if (!response.ok) {
        throw new Error(result.error ?? "Não foi possível criar a conta.");
      }
      setSuccess(
        result.message ??
          "Solicitação recebida. Aguarde a aprovação da administração."
      );
      setPassword("");
      setConfirmPassword("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível criar a conta. Tente novamente."
      );
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
          <h1>Faça parte de uma comunidade que cuida de pessoas.</h1>
          <p>
            Crie sua conta e envie uma solicitação de acesso à plataforma.
          </p>
        </div>
        <small className={styles.brandFooter}>Acesso sujeito à aprovação administrativa.</small>
      </section>

      <section className={styles.formPanel}>
        <div className={styles.formCard}>
          <Link className={styles.backLink} href="/">
            ← Página inicial
          </Link>
          <div className={styles.heading}>
            <span>ACESSO À PLATAFORMA</span>
            <h2>Criar minha conta</h2>
            <p>Preencha seus dados para solicitar acesso ao sistema.</p>
          </div>

          {error && <div className={styles.error} role="alert">{error}</div>}
          {success && (
            <div className={styles.success} role="status">
              <strong>Solicitação enviada</strong>
              <span>{success}</span>
              <Link href="/entrar">Ir para entrar</Link>
            </div>
          )}

          {!success && (
            <form className={styles.form} onSubmit={submit}>
              <label>
                <span>Nome completo</span>
                <input
                  autoComplete="name"
                  maxLength={120}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Seu nome completo"
                  required
                  value={fullName}
                />
              </label>

              <label>
                <span>E-mail</span>
                <input
                  autoCapitalize="none"
                  autoComplete="email"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="voce@exemplo.com"
                  required
                  type="email"
                  value={email}
                />
              </label>

              <label>
                <span>Senha</span>
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
                <span>Confirmar senha</span>
                <input
                  autoComplete="new-password"
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Digite novamente sua senha"
                  required
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                />
              </label>

              <p className={styles.approvalNote}>
                Novas contas são criadas sem acesso até a aprovação de um
                administrador. O perfil inicial não pode ser escolhido nesta tela.
              </p>

              <button className={styles.submitButton} disabled={saving} type="submit">
                {saving ? "Enviando solicitação..." : "Criar minha conta"}
              </button>
            </form>
          )}

          <div className={styles.loginLink}>
            Já tem uma conta? <Link href="/entrar">Entrar</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
