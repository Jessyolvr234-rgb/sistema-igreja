
"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./login.module.css";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<
    "error" | "success" | "info"
  >("info");

  function showMessage(
    type: "error" | "success" | "info",
    text: string
  ) {
    setMessageType(type);
    setMessage(text);
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setMessage("");

    const normalizedEmail = email.trim();

    if (!normalizedEmail || !password) {
      showMessage("error", "Preencha seu e-mail e sua senha.");
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(normalizedEmail)) {
      showMessage("error", "Digite um endereço de e-mail válido.");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();

      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        showMessage(
          "error",
          "E-mail ou senha incorretos. Verifique seus dados e tente novamente."
        );
        return;
      }

      showMessage("success", "Login realizado com sucesso!");

      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      console.error("Erro no login:", error);

      showMessage(
        "error",
        "Não foi possível conectar ao sistema. Tente novamente."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordRecovery() {
    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      showMessage(
        "info",
        "Digite seu e-mail para solicitar a recuperação da senha."
      );
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(normalizedEmail)) {
      showMessage("error", "Digite um e-mail válido.");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();

      const { error } = await supabase.auth.resetPasswordForEmail(
        normalizedEmail,
        {
          redirectTo: `${window.location.origin}/redefinir-senha`,
        }
      );

      if (error) {
        showMessage(
          "error",
          "Não foi possível solicitar a recuperação. Tente novamente."
        );
        return;
      }

      showMessage(
        "success",
        "Se o e-mail estiver cadastrado, você receberá as instruções para redefinir sua senha."
      );
    } catch (error) {
      console.error("Erro na recuperação:", error);

      showMessage(
        "error",
        "Ocorreu um erro ao solicitar a recuperação da senha."
      );
    } finally {
      setLoading(false);
    }
  }

  function togglePassword() {
    setShowPassword((previousValue) => !previousValue);
  }

  return (
    <main className={styles.container}>
      <section className={styles.brandPanel}>
        <div className={styles.brandContent}>
          <div className={styles.logo}>
            <Image
              src="/rede-emaus.png"
              alt="Rede Emaús"
              width={188}
              height={84}
              priority
            />
          </div>

          <div className={styles.welcome}>
            <span className={styles.eyebrow}>
              GESTÃO E ORGANIZAÇÃO
            </span>

            <h1>
              Cuidar de pessoas.
              <br />
              Fortalecer conexões.
            </h1>

            <p>
              Uma plataforma para organizar membros, acompanhar células
              e fortalecer o trabalho da igreja.
            </p>
          </div>

          <div className={styles.brandFooter}>
            Sistema de Gestão da Igreja
          </div>
        </div>
      </section>

      <section className={styles.formPanel}>
        <div className={styles.loginCard}>
          <div className={styles.mobileLogo}>
            <Image
              src="/rede-emaus.png"
              alt="Rede Emaús"
              width={152}
              height={68}
              priority
            />
            <span>Gestão Igreja</span>
          </div>

          <div className={styles.heading}>
            <span className={styles.eyebrow}>
              ÁREA RESTRITA
            </span>

            <h2>Bem-vindo de volta!</h2>

            <p>
              Entre com seus dados para acessar o sistema.
            </p>
          </div>

          <form
            className={styles.form}
            onSubmit={handleSubmit}
            noValidate
          >
            <div className={styles.field}>
              <label htmlFor="email">E-mail</label>

              <input
                id="email"
                name="email"
                type="email"
                placeholder="seuemail@exemplo.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                disabled={loading}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="password">Senha</label>

              <div className={styles.passwordWrapper}>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Digite sua senha"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  disabled={loading}
                />

                <button
                  type="button"
                  className={styles.showPassword}
                  onClick={togglePassword}
                  aria-label={
                    showPassword ? "Ocultar senha" : "Mostrar senha"
                  }
                  aria-pressed={showPassword}
                  disabled={loading}
                >
                  {showPassword ? "Ocultar" : "Mostrar"}
                </button>
              </div>
            </div>

            <div className={styles.formOptions}>
              <label className={styles.remember}>
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                  disabled={loading}
                />

                <span>Manter conectado</span>
              </label>

              <button
                type="button"
                className={styles.forgotPassword}
                onClick={handlePasswordRecovery}
                disabled={loading}
              >
                Esqueceu a senha?
              </button>
            </div>

            <button
              type="submit"
              className={styles.submitButton}
              disabled={loading}
            >
              {loading ? "Verificando..." : "Entrar no sistema"}
              {!loading && <span aria-hidden="true">→</span>}
            </button>

            {message && (
              <div
                className={`${styles.message} ${
                  messageType === "error"
                    ? styles.messageError
                    : messageType === "success"
                    ? styles.messageSuccess
                    : styles.messageInfo
                }`}
                role="alert"
                aria-live="polite"
              >
                {message}
              </div>
            )}
          </form>

          <div className={styles.security}>
            <span>●</span>
            Acesso exclusivo para usuários autorizados
          </div>
        </div>
      </section>
    </main>
  );
}
