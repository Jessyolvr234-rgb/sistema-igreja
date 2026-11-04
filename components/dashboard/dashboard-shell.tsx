
"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./dashboard.module.css";

type Props = {
  email: string;
  children?: ReactNode;
};

type HeaderProfile = {
  fullName: string;
  avatarUrl: string | null;
};

type IconName =
  | "overview"
  | "members"
  | "networks"
  | "users"
  | "cells"
  | "attendance"
  | "requirements"
  | "reports"
  | "settings"
  | "menu";

const menuItems = [
  { icon: "overview", label: "Visão geral", href: "/dashboard" },
  { icon: "members", label: "Membros", href: "/dashboard/membros" },
  { icon: "networks", label: "Redes", href: "/dashboard/redes" },
  { icon: "users", label: "Usuários", href: "/dashboard/usuarios" },
  { icon: "cells", label: "Células", href: "/dashboard/celulas" },
  { icon: "attendance", label: "Frequência", href: "/dashboard/frequencia" },
  { icon: "requirements", label: "Requisitos", href: "/dashboard/requisitos" },
  { icon: "reports", label: "Relatórios", href: "/dashboard/relatorios" },
  {
    icon: "settings",
    label: "Configurações",
    href: "/dashboard/configuracoes",
  },
] as const;

const stats = [
  { label: "Total de membros", icon: "members" },
  { label: "Redes cadastradas", icon: "networks" },
  { label: "Células ativas", icon: "cells" },
  { label: "Frequência recente", icon: "attendance" },
] as const;

const iconPaths: Record<IconName, string[]> = {
  overview: [
    "M3 3h8v8H3z M14 3h7v5h-7z M14 11h7v10h-7z M3 14h8v7H3z",
  ],

  members: [
    "M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2",
    "M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
    "M20 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  ],

  users: [
    "M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2",
    "M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
    "M20 21v-2a4 4 0 0 0-3-3.87",
  ],

  networks: [
    "M12 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M5 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    "m10.5 7-4 8 M13.5 7l4 8 M8 18h8",
  ],

  cells: [
    "M3 21h18 M5 21V5l7-3 7 3v16 M9 9h.01 M15 9h.01 M9 13h.01 M15 13h.01 M10 21v-4h4v4",
  ],

  attendance: [
    "M8 2v4 M16 2v4 M3 10h18",
    "M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2z",
    "m8 15 2.5 2.5L16 12",
  ],

  requirements: [
    "M9 6h11 M9 12h11 M9 18h11",
    "M4 6h.01 M4 12h.01 M4 18h.01",
  ],

  reports: [
    "M4 19V5 M4 19h17 M8 16v-5 M13 16V7 M18 16V3",
  ],

  settings: [
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
    "M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.7 2.94-.08-.02a1.7 1.7 0 0 0-1.78.74l-.04.07h-3.4l-.04-.07a1.7 1.7 0 0 0-1.78-.74l-.08.02-1.7-2.94.06-.06A1.7 1.7 0 0 0 9.6 15l-.07-.04v-3.4l.07-.04a1.7 1.7 0 0 0 .74-1.78l-.02-.08 2.94-1.7.06.06a1.7 1.7 0 0 0 1.88.34l.04-.07h3.4l.04.07a1.7 1.7 0 0 0 1.78.74l.08-.02 1.7 2.94-.06.06A1.7 1.7 0 0 0 21.6 14l.07.04v3.4l-.07.04a1.7 1.7 0 0 0-2.2-2.48z",
  ],

  menu: ["M4 6h16 M4 12h16 M4 18h16"],
};

function DashboardIcon({
  name,
  className,
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {iconPaths[name].map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}

export default function DashboardShell({ email, children }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [headerProfile, setHeaderProfile] = useState<HeaderProfile | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const pathname = usePathname();

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const savedTheme = window.localStorage.getItem("gestao-emaus-theme");
      if (savedTheme === "light" || savedTheme === "dark") {
        setTheme(savedTheme);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const loadProfile = () => {
      fetch("/api/dashboard/profile", { signal: controller.signal })
        .then(async (response) => {
          const result = (await response.json()) as {
            profile?: HeaderProfile;
            error?: string;
          };
          if (!response.ok || !result.profile) {
            throw new Error(result.error ?? "Não foi possível carregar o perfil.");
          }
          setHeaderProfile(result.profile);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          console.error("Erro ao carregar perfil no cabeçalho:", error);
        });
    };

    const handleProfileUpdate = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const profile = event.detail as HeaderProfile;
      if (
        typeof profile?.fullName === "string" &&
        (typeof profile.avatarUrl === "string" || profile.avatarUrl === null)
      ) {
        setHeaderProfile(profile);
      }
    };

    loadProfile();
    window.addEventListener("dashboard-profile-updated", handleProfileUpdate);
    return () => {
      controller.abort();
      window.removeEventListener(
        "dashboard-profile-updated",
        handleProfileUpdate
      );
    };
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    window.localStorage.setItem("gestao-emaus-theme", nextTheme);
  }

  return (
    <div className={styles.dashboard} data-theme={theme}>
      {menuOpen && (
        <button
          type="button"
          className={styles.overlay}
          onClick={() => setMenuOpen(false)}
          aria-label="Fechar menu"
        />
      )}

      <aside
        className={`${styles.sidebar} ${
          menuOpen ? styles.sidebarOpen : ""
        }`}
      >
        <div className={styles.logo}>
          <Image
            className={styles.logoImage}
            src="/rede-emaus.png"
            alt="Rede Emaús"
            width={132}
            height={59}
            priority
          />
          <div>
            <strong className={styles.logoText}>Gestão Igreja</strong>
            <small className={styles.logoSubtitle}>
              Administração
            </small>
          </div>
        </div>

        <div className={styles.menuTitle}>MENU PRINCIPAL</div>

        <nav className={styles.menu} aria-label="Menu principal">
          {menuItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`${styles.menuItem} ${
                  active ? styles.active : ""
                }`}
                onClick={() => setMenuOpen(false)}
                aria-current={active ? "page" : undefined}
              >
                <DashboardIcon
                  name={item.icon}
                  className={styles.menuIcon}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.sidebarStatus}>
            <span className={styles.statusDot} />
            Sistema operacional
          </div>
          <form action="/auth/signout" method="post">
            <button type="submit" className={styles.sidebarSignOut}>
              Sair
            </button>
          </form>
        </div>
      </aside>

      <main className={styles.main}>
        <header className={styles.header}>
          <button
            type="button"
            className={styles.menuButton}
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menu"
            aria-expanded={menuOpen}
          >
            <DashboardIcon
              name="menu"
              className={styles.menuButtonIcon}
            />
          </button>

          <div>
            <div className={styles.headerTitle}>
              {pathname === "/dashboard/usuarios"
                ? "Usuários"
                : pathname === "/dashboard/perfil"
                  ? "Meu perfil"
                : pathname === "/dashboard/membros"
                  ? "Membros"
                  : pathname === "/dashboard/redes"
                    ? "Redes"
                    : pathname === "/dashboard/celulas"
                      ? "Células"
                      : pathname === "/dashboard/frequencia"
                        ? "Frequência"
                        : pathname === "/dashboard/requisitos"
                          ? "Requisitos"
                          : pathname === "/dashboard/relatorios"
                            ? "Relatórios"
                            : pathname === "/dashboard/configuracoes"
                              ? "Configurações"
                    : "Visão geral"}
            </div>
            <div className={styles.headerSubtitle}>
              Painel de controle
            </div>
          </div>

          <div className={styles.userArea}>
            <button
              aria-label={
                theme === "light"
                  ? "Ativar modo escuro"
                  : "Ativar modo claro"
              }
              aria-pressed={theme === "dark"}
              className={styles.themeToggle}
              onClick={toggleTheme}
              title={theme === "light" ? "Modo escuro" : "Modo claro"}
              type="button"
            >
              {theme === "light" ? (
                <svg
                  aria-hidden="true"
                  fill="none"
                  viewBox="0 0 24 24"
                  width="19"
                  height="19"
                >
                  <path
                    d="M20.2 15.2A8.5 8.5 0 0 1 8.8 3.8 8.5 8.5 0 1 0 20.2 15.2Z"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                  />
                </svg>
              ) : (
                <svg
                  aria-hidden="true"
                  fill="none"
                  viewBox="0 0 24 24"
                  width="19"
                  height="19"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="4"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                  <path
                    d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="1.8"
                  />
                </svg>
              )}
            </button>
            <Link
              aria-label="Abrir meu perfil"
              className={styles.profileLink}
              href="/dashboard/perfil"
              title="Meu perfil"
            >
              <span className={styles.avatar}>
                {headerProfile?.avatarUrl ? (
                  <Image
                    alt=""
                    className={styles.avatarImage}
                    fill
                    sizes="40px"
                    src={headerProfile.avatarUrl}
                    unoptimized
                  />
                ) : (
                  (headerProfile?.fullName || email).charAt(0).toUpperCase() ||
                  "U"
                )}
              </span>

              <span className={styles.userInfo}>
                <strong>{headerProfile?.fullName || "Usuário"}</strong>
                <span>{email || "Usuário autenticado"}</span>
              </span>
            </Link>

          </div>
        </header>

        <div className={styles.content}>
          {children ?? (
            <>
              <section className={styles.welcome}>
                <div>
                  <h1>Bem-vindo ao Gestão Igreja!</h1>
                  <p>
                    Acompanhe as atividades e cuide de cada conexão da sua
                    igreja.
                  </p>
                </div>
              </section>

              <section className={styles.stats} aria-label="Resumo">
                {stats.map((stat) => (
                  <article className={styles.statCard} key={stat.label}>
                    <div className={styles.statLabel}>
                      <span>{stat.label}</span>
                      <span className={styles.statIcon}>
                        <DashboardIcon name={stat.icon} />
                      </span>
                    </div>
                    <strong className={styles.statValue}>—</strong>
                    <small>Dados serão conectados ao banco</small>
                  </article>
                ))}
              </section>

              <section className={styles.bottomGrid}>
                <article className={styles.section}>
                  <h2>Atividades recentes</h2>
                  <p className={styles.sectionDescription}>
                    As movimentações da igreja aparecerão aqui conforme forem
                    registradas.
                  </p>
                  <div className={styles.activity}>
                    Nenhuma atividade registrada ainda.
                  </div>
                </article>

                <article className={styles.section}>
                  <h2>Acesso rápido</h2>
                  <div className={styles.quickActions}>
                    <button
                      type="button"
                      className={styles.actionButton}
                      disabled
                    >
                      + Cadastrar membro
                    </button>
                    <button
                      type="button"
                      className={styles.actionButton}
                      disabled
                    >
                      Registrar frequência
                    </button>
                    <button
                      type="button"
                      className={styles.actionButton}
                      disabled
                    >
                      Consultar células
                    </button>
                  </div>
                  <small className={styles.comingSoon}>
                    Ações disponíveis em breve.
                  </small>
                </article>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
