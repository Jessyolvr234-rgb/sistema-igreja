
"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./dashboard.module.css";

type Props = {
  email: string;
  children?: ReactNode;
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
  const pathname = usePathname();

  return (
    <div className={styles.dashboard}>
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
          <span className={styles.statusDot} />
          Sistema operacional
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
            <div className={styles.avatar}>
              {email.charAt(0).toUpperCase() || "U"}
            </div>

            <div className={styles.userInfo}>
              <strong>Usuário</strong>
              <span>{email || "Usuário autenticado"}</span>
            </div>

            <form action="/auth/signout" method="post">
              <button type="submit" className={styles.signOut}>
                Sair
              </button>
            </form>
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
