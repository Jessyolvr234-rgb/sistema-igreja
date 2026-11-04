"use client";

import { useCallback, useEffect, useState } from "react";
import PwaInstallButton from "@/components/pwa/pwa-install-button";
import styles from "./dashboard.module.css";

type SettingsTab =
  | "church"
  | "users"
  | "permissions"
  | "preferences"
  | "audit";
type UserRole = "admin" | "supervisor" | "leader";
type AdminUser = {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  isActive: boolean;
};
type AuditEntry = {
  id: string;
  userName: string;
  action: string;
  entityType: string;
  entityId: string;
  description: string;
  createdAt: string;
};
type AuditPage = {
  entries: AuditEntry[];
  page: number;
  pageSize: number;
  total: number;
};
type SettingsData = {
  currentUserId: string;
  church: Record<string, unknown>;
  preferences: Record<string, unknown>;
  users: AdminUser[];
  audit: AuditPage;
};
type ChurchForm = {
  name: string;
  cnpj: string;
  phone: string;
  email: string;
  address: string;
  logoUrl: string;
  description: string;
};
type PreferencesForm = {
  meetingDay: string;
  meetingTime: string;
  notificationsEnabled: boolean;
  compactDisplay: boolean;
  defaultReportPeriod: string;
};

const EMPTY_CHURCH: ChurchForm = {
  name: "",
  cnpj: "",
  phone: "",
  email: "",
  address: "",
  logoUrl: "",
  description: "",
};
const EMPTY_PREFERENCES: PreferencesForm = {
  meetingDay: "sunday",
  meetingTime: "19:00",
  notificationsEnabled: true,
  compactDisplay: false,
  defaultReportPeriod: "12",
};
const TABS: { id: SettingsTab; label: string }[] = [
  { id: "church", label: "Dados da igreja" },
  { id: "users", label: "Usuários" },
  { id: "permissions", label: "Acessos" },
  { id: "preferences", label: "Preferências" },
  { id: "audit", label: "Auditoria" },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function apiError(payload: unknown, fallback: string) {
  return isRecord(payload) && typeof payload.error === "string"
    ? payload.error
    : fallback;
}

function isAdminUser(value: unknown): value is AdminUser {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.fullName === "string" &&
    typeof value.email === "string" &&
    (value.role === "admin" ||
      value.role === "supervisor" ||
      value.role === "leader") &&
    typeof value.isActive === "boolean"
  );
}

function parseSettingsData(value: unknown): SettingsData | null {
  if (
    !isRecord(value) ||
    typeof value.currentUserId !== "string" ||
    !isRecord(value.church) ||
    !isRecord(value.preferences) ||
    !Array.isArray(value.users) ||
    !value.users.every(isAdminUser) ||
    !isRecord(value.audit) ||
    !Array.isArray(value.audit.entries) ||
    typeof value.audit.page !== "number" ||
    typeof value.audit.pageSize !== "number" ||
    typeof value.audit.total !== "number"
  ) {
    return null;
  }
  const entries = value.audit.entries;
  if (
    !entries.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.id === "string" &&
        typeof entry.userName === "string" &&
        typeof entry.action === "string" &&
        typeof entry.entityType === "string" &&
        typeof entry.entityId === "string" &&
        typeof entry.description === "string" &&
        typeof entry.createdAt === "string"
    )
  ) {
    return null;
  }
  return value as unknown as SettingsData;
}

function stringValue(source: Record<string, unknown>, key: string, fallback: string) {
  return typeof source[key] === "string" ? source[key] as string : fallback;
}

function booleanValue(
  source: Record<string, unknown>,
  key: string,
  fallback: boolean
) {
  return typeof source[key] === "boolean" ? source[key] as boolean : fallback;
}

function roleLabel(role: UserRole) {
  if (role === "admin") return "Administrador";
  if (role === "supervisor") return "Supervisor";
  return "Líder";
}

function dateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Data não disponível"
    : date.toLocaleString("pt-BR");
}

export default function SettingsManagement() {
  const [tab, setTab] = useState<SettingsTab>("church");
  const [data, setData] = useState<SettingsData | null>(null);
  const [church, setChurch] = useState<ChurchForm>(EMPTY_CHURCH);
  const [preferences, setPreferences] =
    useState<PreferencesForm>(EMPTY_PREFERENCES);
  const [auditPage, setAuditPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyUserId, setBusyUserId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const loadSettings = useCallback(async (page: number) => {
    const response = await fetch(`/api/admin/settings?page=${page}`);
    const payload: unknown = await response.json();
    if (!response.ok) {
      throw new Error(
        apiError(payload, "Não foi possível carregar as configurações.")
      );
    }
    const parsed = parseSettingsData(payload);
    if (!parsed) {
      throw new Error("O servidor retornou configurações em formato inválido.");
    }
    return parsed;
  }, []);

  const applySettings = useCallback((parsed: SettingsData) => {
    setData(parsed);
    setChurch({
      name: stringValue(parsed.church, "name", ""),
      cnpj: stringValue(parsed.church, "cnpj", ""),
      phone: stringValue(parsed.church, "phone", ""),
      email: stringValue(parsed.church, "email", ""),
      address: stringValue(parsed.church, "address", ""),
      logoUrl: stringValue(parsed.church, "logoUrl", ""),
      description: stringValue(parsed.church, "description", ""),
    });
    setPreferences({
      meetingDay: stringValue(
        parsed.preferences,
        "meetingDay",
        EMPTY_PREFERENCES.meetingDay
      ),
      meetingTime: stringValue(
        parsed.preferences,
        "meetingTime",
        EMPTY_PREFERENCES.meetingTime
      ),
      notificationsEnabled: booleanValue(
        parsed.preferences,
        "notificationsEnabled",
        EMPTY_PREFERENCES.notificationsEnabled
      ),
      compactDisplay: booleanValue(
        parsed.preferences,
        "compactDisplay",
        EMPTY_PREFERENCES.compactDisplay
      ),
      defaultReportPeriod: String(
        parsed.preferences.defaultReportPeriod ??
          EMPTY_PREFERENCES.defaultReportPeriod
      ),
    });
  }, []);

  useEffect(() => {
    let active = true;
    loadSettings(auditPage)
      .then((parsed) => {
        if (active) {
          applySettings(parsed);
          setErrorMessage("");
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar as configurações."
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [auditPage, applySettings, loadSettings]);

  async function saveSection(
    section: "church" | "preferences",
    values: ChurchForm | PreferencesForm
  ) {
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, values }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(apiError(payload, "Não foi possível salvar."));
      }
      setSuccessMessage("Configurações salvas com sucesso.");
      applySettings(await loadSettings(auditPage));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Não foi possível salvar."
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateUser(
    user: AdminUser,
    changes: { role?: "supervisor" | "leader"; isActive?: boolean }
  ) {
    setBusyUserId(user.id);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, ...changes }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(apiError(payload, "Não foi possível atualizar o usuário."));
      }
      setSuccessMessage("Acesso do usuário atualizado.");
      applySettings(await loadSettings(auditPage));
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar o usuário."
      );
    } finally {
      setBusyUserId("");
    }
  }

  const totalAuditPages = Math.max(
    1,
    Math.ceil((data?.audit.total ?? 0) / (data?.audit.pageSize ?? 25))
  );

  return (
    <section className={styles.modulePage} aria-labelledby="settings-title">
      <div className={styles.moduleHeading}>
        <div>
          <span className={styles.moduleEyebrow}>ADMINISTRAÇÃO</span>
          <h1 id="settings-title">Configurações</h1>
          <p>Dados institucionais, usuários, acessos e preferências do sistema</p>
        </div>
      </div>
      <p className={styles.moduleNote}>
        As configurações são armazenadas em <code>system_settings</code>. Nenhuma
        credencial ou chave secreta é exibida ou editável nesta tela.
      </p>

      <section className={styles.moduleForm} aria-labelledby="pwa-install-title">
        <h2 id="pwa-install-title">Aplicativo Rede Êmaús</h2>
        <p>
          Adicione o sistema à tela inicial ou ao Dock para abrir rapidamente.
          Os dados privados e as páginas da conta não ficam disponíveis offline.
        </p>
        <PwaInstallButton />
      </section>

      <div className={styles.settingsTabs} role="tablist" aria-label="Seções">
        {TABS.map((item) => (
          <button
            type="button"
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            className={`${styles.settingsTab} ${
              tab === item.id ? styles.settingsTabActive : ""
            }`}
            onClick={() => {
              setTab(item.id);
              setErrorMessage("");
              setSuccessMessage("");
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {errorMessage && (
        <div className={styles.moduleError} role="alert">
          {errorMessage}
        </div>
      )}
      {successMessage && (
        <div className={styles.moduleSuccess} role="status">
          {successMessage}
        </div>
      )}
      {loading && !data ? (
        <p className={styles.moduleEmpty}>Carregando configurações...</p>
      ) : (
        <>
          {tab === "church" && (
            <section className={styles.moduleForm} aria-labelledby="church-data">
              <h2 id="church-data">Dados da igreja</h2>
              <div className={styles.moduleFields}>
                <label className={styles.moduleField}>
                  <span>Nome da igreja</span>
                  <input
                    value={church.name}
                    maxLength={180}
                    onChange={(event) =>
                      setChurch({ ...church, name: event.target.value })
                    }
                  />
                </label>
                <label className={styles.moduleField}>
                  <span>CNPJ (opcional)</span>
                  <input
                    value={church.cnpj}
                    maxLength={32}
                    onChange={(event) =>
                      setChurch({ ...church, cnpj: event.target.value })
                    }
                  />
                </label>
                <label className={styles.moduleField}>
                  <span>Telefone</span>
                  <input
                    value={church.phone}
                    maxLength={40}
                    onChange={(event) =>
                      setChurch({ ...church, phone: event.target.value })
                    }
                  />
                </label>
                <label className={styles.moduleField}>
                  <span>E-mail</span>
                  <input
                    type="email"
                    value={church.email}
                    maxLength={254}
                    onChange={(event) =>
                      setChurch({ ...church, email: event.target.value })
                    }
                  />
                </label>
                <label className={`${styles.moduleField} ${styles.moduleFieldWide}`}>
                  <span>Endereço</span>
                  <input
                    value={church.address}
                    maxLength={500}
                    onChange={(event) =>
                      setChurch({ ...church, address: event.target.value })
                    }
                  />
                </label>
                <label className={`${styles.moduleField} ${styles.moduleFieldWide}`}>
                  <span>URL do logotipo</span>
                  <input
                    type="url"
                    value={church.logoUrl}
                    maxLength={2000}
                    placeholder="https://..."
                    onChange={(event) =>
                      setChurch({ ...church, logoUrl: event.target.value })
                    }
                  />
                  <small>
                    O banco não possui integração de armazenamento de arquivos;
                    informe uma URL pública existente.
                  </small>
                </label>
                <label className={`${styles.moduleField} ${styles.moduleFieldWide}`}>
                  <span>Descrição institucional</span>
                  <textarea
                    value={church.description}
                    maxLength={2000}
                    onChange={(event) =>
                      setChurch({ ...church, description: event.target.value })
                    }
                  />
                </label>
              </div>
              <div className={styles.moduleFormActions}>
                <button
                  type="button"
                  className={styles.modulePrimaryButton}
                  disabled={saving}
                  onClick={() => void saveSection("church", church)}
                >
                  {saving ? "Salvando..." : "Salvar dados da igreja"}
                </button>
              </div>
            </section>
          )}

          {tab === "preferences" && (
            <section
              className={styles.moduleForm}
              aria-labelledby="system-preferences"
            >
              <h2 id="system-preferences">Preferências do sistema</h2>
              <div className={styles.moduleFields}>
                <label className={styles.moduleField}>
                  <span>Dia padrão de reunião</span>
                  <select
                    value={preferences.meetingDay}
                    onChange={(event) =>
                      setPreferences({
                        ...preferences,
                        meetingDay: event.target.value,
                      })
                    }
                  >
                    <option value="sunday">Domingo</option>
                    <option value="monday">Segunda-feira</option>
                    <option value="tuesday">Terça-feira</option>
                    <option value="wednesday">Quarta-feira</option>
                    <option value="thursday">Quinta-feira</option>
                    <option value="friday">Sexta-feira</option>
                    <option value="saturday">Sábado</option>
                  </select>
                </label>
                <label className={styles.moduleField}>
                  <span>Horário padrão de reunião</span>
                  <input
                    type="time"
                    value={preferences.meetingTime}
                    onChange={(event) =>
                      setPreferences({
                        ...preferences,
                        meetingTime: event.target.value,
                      })
                    }
                  />
                </label>
                <label className={styles.moduleField}>
                  <span>Período inicial dos relatórios</span>
                  <select
                    value={preferences.defaultReportPeriod}
                    onChange={(event) =>
                      setPreferences({
                        ...preferences,
                        defaultReportPeriod: event.target.value,
                      })
                    }
                  >
                    <option value="1">Último mês</option>
                    <option value="3">Últimos 3 meses</option>
                    <option value="6">Últimos 6 meses</option>
                    <option value="12">Últimos 12 meses</option>
                  </select>
                </label>
                <label className={styles.settingsToggle}>
                  <input
                    type="checkbox"
                    checked={preferences.notificationsEnabled}
                    onChange={(event) =>
                      setPreferences({
                        ...preferences,
                        notificationsEnabled: event.target.checked,
                      })
                    }
                  />
                  <span>Preferir notificações do sistema</span>
                </label>
                <label className={styles.settingsToggle}>
                  <input
                    type="checkbox"
                    checked={preferences.compactDisplay}
                    onChange={(event) =>
                      setPreferences({
                        ...preferences,
                        compactDisplay: event.target.checked,
                      })
                    }
                  />
                  <span>Preferir exibição compacta</span>
                </label>
              </div>
              <p className={styles.moduleNote}>
                As preferências ficam salvas; notificações e densidade visual
                só terão efeito quando os respectivos recursos forem integrados
                às telas.
              </p>
              <div className={styles.moduleFormActions}>
                <button
                  type="button"
                  className={styles.modulePrimaryButton}
                  disabled={saving}
                  onClick={() => void saveSection("preferences", preferences)}
                >
                  {saving ? "Salvando..." : "Salvar preferências"}
                </button>
              </div>
            </section>
          )}

          {tab === "users" && (
            <section className={styles.moduleForm}>
              <div className={styles.moduleFormHeading}>
                <h2>Usuários cadastrados</h2>
                <span className={styles.moduleNote}>
                  {data?.users.length ?? 0} perfil(is)
                </span>
              </div>
              <p className={styles.moduleNote}>
                Administradores não podem ser promovidos ou desativados por
                esta tela. Seu próprio acesso também não pode ser alterado.
              </p>
              <div className={styles.moduleTableCard}>
                <div className={styles.moduleTableScroll}>
                  <table className={styles.moduleTable}>
                    <thead>
                      <tr>
                        <th>Usuário</th>
                        <th>Função</th>
                        <th>Situação</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.users.map((user) => {
                        const editable =
                          user.role !== "admin" &&
                          user.id !== data.currentUserId;
                        return (
                          <tr key={user.id}>
                            <td data-label="Usuário">
                              <strong className={styles.moduleName}>
                                {user.fullName}
                                {user.id === data.currentUserId ? " (Você)" : ""}
                              </strong>
                              <span className={styles.moduleSubtext}>
                                {user.email}
                              </span>
                            </td>
                            <td data-label="Função">{roleLabel(user.role)}</td>
                            <td data-label="Situação">
                              {user.isActive ? "Ativo" : "Inativo"}
                            </td>
                            <td data-label="Ações">
                              {editable ? (
                                <div className={styles.settingsUserActions}>
                                  <select
                                    aria-label={`Função de ${user.fullName}`}
                                    value={user.role}
                                    disabled={busyUserId === user.id}
                                    onChange={(event) => {
                                      const role = event.target.value;
                                      if (
                                        role === "leader" ||
                                        role === "supervisor"
                                      ) {
                                        void updateUser(user, { role });
                                      }
                                    }}
                                  >
                                    <option value="leader">Líder</option>
                                    <option value="supervisor">Supervisor</option>
                                  </select>
                                  <button
                                    type="button"
                                    className={styles.moduleTextButton}
                                    disabled={busyUserId === user.id}
                                    onClick={() =>
                                      void updateUser(user, {
                                        isActive: !user.isActive,
                                      })
                                    }
                                  >
                                    {busyUserId === user.id
                                      ? "Salvando..."
                                      : user.isActive
                                        ? "Desativar"
                                        : "Ativar"}
                                  </button>
                                </div>
                              ) : (
                                <span className={styles.moduleNote}>
                                  Acesso protegido
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {!data?.users.length && (
                        <tr>
                          <td colSpan={4} className={styles.moduleEmpty}>
                            Nenhum usuário cadastrado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className={styles.moduleNote}>
                A tabela <code>profiles</code> não expõe data de cadastro neste
                fluxo; por isso, a tela não inventa essa informação.
              </p>
            </section>
          )}

          {tab === "permissions" && (
            <section className={styles.moduleForm}>
              <h2>Permissões por função</h2>
              <div className={styles.moduleTableCard}>
                <div className={styles.moduleTableScroll}>
                  <table className={styles.moduleTable}>
                    <thead>
                      <tr>
                        <th>Recurso</th>
                        <th>Administrador</th>
                        <th>Supervisor</th>
                        <th>Líder</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td data-label="Recurso">Redes</td>
                        <td data-label="Administrador">Todas: gerenciar</td>
                        <td data-label="Supervisor">
                          Atribuídas: gerenciar; novas redes vinculadas
                        </td>
                        <td data-label="Líder">Rede da célula: consultar</td>
                      </tr>
                      <tr>
                        <td data-label="Recurso">Células e membros</td>
                        <td data-label="Administrador">Todas: gerenciar</td>
                        <td data-label="Supervisor">
                          Redes atribuídas: gerenciar
                        </td>
                        <td data-label="Líder">
                          Própria célula: membros gerenciar
                        </td>
                      </tr>
                      <tr>
                        <td data-label="Recurso">Frequência</td>
                        <td data-label="Administrador">Todas</td>
                        <td data-label="Supervisor">Redes atribuídas</td>
                        <td data-label="Líder">
                          Própria célula: consultar e registrar
                        </td>
                      </tr>
                      <tr>
                        <td data-label="Recurso">Requisitos</td>
                        <td data-label="Administrador">Gerenciar globalmente</td>
                        <td data-label="Supervisor">
                          Catálogo global e membros das redes
                        </td>
                        <td data-label="Líder">
                          Consultar/atualizar membros da célula
                        </td>
                      </tr>
                      <tr>
                        <td data-label="Recurso">Relatórios</td>
                        <td data-label="Administrador">Todos</td>
                        <td data-label="Supervisor">Redes atribuídas</td>
                        <td data-label="Líder">Sem acesso geral</td>
                      </tr>
                      <tr>
                        <td data-label="Recurso">Usuários e configurações</td>
                        <td data-label="Administrador">Gerenciar</td>
                        <td data-label="Supervisor">Gerenciar</td>
                        <td data-label="Líder">Sem acesso</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <p className={styles.moduleNote}>
                A autorização é aplicada no servidor; esta tabela descreve os
                escopos do sistema e não substitui as validações de acesso.
              </p>
            </section>
          )}

          {tab === "audit" && (
            <section className={styles.moduleForm}>
              <div className={styles.moduleFormHeading}>
                <h2>Registro de auditoria</h2>
                <span className={styles.moduleNote}>
                  {data?.audit.total ?? 0} registro(s)
                </span>
              </div>
              <div className={styles.moduleTableCard}>
                <div className={styles.moduleTableScroll}>
                  <table className={styles.moduleTable}>
                    <thead>
                      <tr>
                        <th>Data e horário</th>
                        <th>Usuário</th>
                        <th>Operação</th>
                        <th>Registro</th>
                        <th>Descrição</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.audit.entries.map((entry) => (
                        <tr key={entry.id}>
                          <td data-label="Data">{dateTime(entry.createdAt)}</td>
                          <td data-label="Usuário">{entry.userName}</td>
                          <td data-label="Operação">
                            {entry.action} · {entry.entityType}
                          </td>
                          <td data-label="Registro">{entry.entityId}</td>
                          <td data-label="Descrição">{entry.description}</td>
                        </tr>
                      ))}
                      {!data?.audit.entries.length && (
                        <tr>
                          <td colSpan={5} className={styles.moduleEmpty}>
                            Nenhum registro de auditoria encontrado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className={styles.modulePagination}>
                <span>
                  Página {auditPage} de {totalAuditPages}
                </span>
                <div>
                  <button
                    type="button"
                    className={styles.moduleSecondaryButton}
                    disabled={auditPage <= 1 || loading}
                    onClick={() => {
                      setLoading(true);
                      setAuditPage((page) => page - 1);
                    }}
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    className={styles.moduleSecondaryButton}
                    disabled={auditPage >= totalAuditPages || loading}
                    onClick={() => {
                      setLoading(true);
                      setAuditPage((page) => page + 1);
                    }}
                  >
                    Próxima
                  </button>
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </section>
  );
}
