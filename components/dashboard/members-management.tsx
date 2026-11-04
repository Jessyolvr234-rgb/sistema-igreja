"use client";

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import styles from "./dashboard.module.css";
import MemberRequirements from "./member-requirements";

type Member = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  birthDate: string | null;
  maritalStatus: string | null;
  cellId: string | null;
  cellName: string | null;
  networkId: string | null;
  networkName: string | null;
  leaderName: string | null;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  canEdit: boolean;
};

type MemberDetail = Omit<
  Member,
  "cellName" | "networkId" | "networkName" | "leaderName"
>;

type MemberHistory = {
  id: string;
  previousStatus: string | null;
  newStatus: string;
  reason: string | null;
  changedBy: string;
  createdAt: string;
};

type MemberResponse = {
  members: Member[];
  networks: { id: string; name: string }[];
  cells: {
    id: string;
    name: string;
    networkId: string;
    isActive: boolean;
    canManage: boolean;
  }[];
  stats: { total: number; active: number; inactive: number; newMembers: number };
  page: number;
  totalPages: number;
  totalResults: number;
};

type MemberForm = {
  fullName: string;
  email: string;
  phone: string;
  birthDate: string;
  maritalStatus: string;
  cellId: string;
  isActive: boolean;
};

const emptyForm: MemberForm = {
  fullName: "",
  email: "",
  phone: "",
  birthDate: "",
  maritalStatus: "",
  cellId: "",
  isActive: true,
};

function getError(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }
  return fallback;
}

function displayDate(value: string | null) {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function formFromMember(member: MemberDetail): MemberForm {
  return {
    fullName: member.fullName,
    email: member.email ?? "",
    phone: member.phone ?? "",
    birthDate: member.birthDate ?? "",
    maritalStatus: member.maritalStatus ?? "",
    cellId: member.cellId ?? "",
    isActive: member.isActive,
  };
}

function isMemberDetail(value: unknown): value is MemberDetail {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return (
    "id" in value &&
    typeof value.id === "string" &&
    "fullName" in value &&
    typeof value.fullName === "string" &&
    "email" in value &&
    (typeof value.email === "string" || value.email === null) &&
    "phone" in value &&
    (typeof value.phone === "string" || value.phone === null) &&
    "birthDate" in value &&
    (typeof value.birthDate === "string" || value.birthDate === null) &&
    "maritalStatus" in value &&
    (typeof value.maritalStatus === "string" ||
      value.maritalStatus === null) &&
    "cellId" in value &&
    (typeof value.cellId === "string" || value.cellId === null) &&
    "isActive" in value &&
    typeof value.isActive === "boolean" &&
    "createdAt" in value &&
    (typeof value.createdAt === "string" || value.createdAt === null) &&
    "updatedAt" in value &&
    (typeof value.updatedAt === "string" || value.updatedAt === null) &&
    "canEdit" in value &&
    typeof value.canEdit === "boolean"
  );
}

function isHistoryList(value: unknown): value is MemberHistory[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item &&
        typeof item === "object" &&
        "id" in item &&
        typeof item.id === "string" &&
        "newStatus" in item &&
        typeof item.newStatus === "string" &&
        "createdAt" in item &&
        typeof item.createdAt === "string" &&
        "changedBy" in item &&
        typeof item.changedBy === "string"
    )
  );
}

function isMemberResponse(value: unknown): value is MemberResponse {
  const isNullableString = (item: unknown) =>
    typeof item === "string" || item === null;

  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "members" in value &&
    Array.isArray(value.members) &&
    value.members.every(
      (member) =>
        member &&
        typeof member === "object" &&
        !Array.isArray(member) &&
        "id" in member &&
        typeof member.id === "string" &&
        "fullName" in member &&
        typeof member.fullName === "string" &&
        "email" in member &&
        isNullableString(member.email) &&
        "phone" in member &&
        isNullableString(member.phone) &&
        "birthDate" in member &&
        isNullableString(member.birthDate) &&
        "maritalStatus" in member &&
        isNullableString(member.maritalStatus) &&
        "cellId" in member &&
        isNullableString(member.cellId) &&
        "cellName" in member &&
        isNullableString(member.cellName) &&
        "networkId" in member &&
        isNullableString(member.networkId) &&
        "networkName" in member &&
        isNullableString(member.networkName) &&
        "leaderName" in member &&
        isNullableString(member.leaderName) &&
        "isActive" in member &&
        typeof member.isActive === "boolean" &&
        "createdAt" in member &&
        isNullableString(member.createdAt) &&
        "updatedAt" in member &&
        isNullableString(member.updatedAt) &&
        "canEdit" in member &&
        typeof member.canEdit === "boolean"
    ) &&
    "networks" in value &&
    Array.isArray(value.networks) &&
    value.networks.every(
      (network) =>
        network &&
        typeof network === "object" &&
        !Array.isArray(network) &&
        "id" in network &&
        typeof network.id === "string" &&
        "name" in network &&
        typeof network.name === "string"
    ) &&
    "cells" in value &&
    Array.isArray(value.cells) &&
    value.cells.every(
      (cell) =>
        cell &&
        typeof cell === "object" &&
        !Array.isArray(cell) &&
        "id" in cell &&
        typeof cell.id === "string" &&
        "name" in cell &&
        typeof cell.name === "string" &&
        "networkId" in cell &&
        typeof cell.networkId === "string" &&
        "isActive" in cell &&
        typeof cell.isActive === "boolean" &&
        "canManage" in cell &&
        typeof cell.canManage === "boolean"
    ) &&
    "stats" in value &&
    !!value.stats &&
    typeof value.stats === "object" &&
    "total" in value.stats &&
    typeof value.stats.total === "number" &&
    "active" in value.stats &&
    typeof value.stats.active === "number" &&
    "inactive" in value.stats &&
    typeof value.stats.inactive === "number" &&
    "newMembers" in value.stats &&
    typeof value.stats.newMembers === "number" &&
    "page" in value &&
    typeof value.page === "number" &&
    "totalPages" in value &&
    typeof value.totalPages === "number" &&
    "totalResults" in value &&
    typeof value.totalResults === "number"
  );
}

export default function MembersManagement() {
  const [data, setData] = useState<MemberResponse | null>(null);
  const [search, setSearch] = useState("");
  const [networkId, setNetworkId] = useState("");
  const [cellId, setCellId] = useState("");
  const [status, setStatus] = useState("");
  const [period, setPeriod] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "view" | "edit">("create");
  const [memberTab, setMemberTab] = useState<"profile" | "requirements">(
    "profile"
  );
  const [selectedId, setSelectedId] = useState("");
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [memberForm, setMemberForm] = useState<MemberForm>(emptyForm);
  const [formNetworkId, setFormNetworkId] = useState("");
  const [selectedCreatedAt, setSelectedCreatedAt] = useState<string | null>(null);
  const [history, setHistory] = useState<MemberHistory[]>([]);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const loadMembers = useCallback(async () => {
    const params = new URLSearchParams({
      page: String(page),
      ...(search.trim() ? { q: search.trim() } : {}),
      ...(networkId ? { networkId } : {}),
      ...(cellId ? { cellId } : {}),
      ...(status ? { status } : {}),
      ...(period ? { period } : {}),
    });

    const response = await fetch(`/api/dashboard/members?${params}`);
    const payload: unknown = await response.json();
    if (!response.ok) {
      throw new Error(getError(payload, "Não foi possível carregar os membros."));
    }

    if (!isMemberResponse(payload)) {
      throw new Error("O servidor retornou uma lista de membros inválida.");
    }
    return payload;
  }, [cellId, networkId, page, period, search, status]);

  useEffect(() => {
    let active = true;
    loadMembers()
      .then((payload) => {
        if (active) {
          setData(payload);
          setErrorMessage("");
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar os membros."
          );
          setData(null);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [loadMembers, refreshKey]);

  const visibleCells =
    networkId && data
      ? data.cells.filter((cell) => cell.networkId === networkId)
      : data?.cells ?? [];
  const formVisibleCells =
    formNetworkId && data
      ? data.cells.filter(
          (cell) => cell.networkId === formNetworkId && cell.canManage
        )
      : data?.cells.filter((cell) => cell.canManage) ?? [];

  function startCreate() {
    setSelectedId("");
    setSelectedMember(null);
    setSelectedCreatedAt(null);
    setFormNetworkId("");
    setMemberForm({
      ...emptyForm,
      cellId:
        data?.cells.length === 1 && data.cells[0].isActive
          ? data.cells[0].id
          : "",
    });
    setHistory([]);
    setFormMode("create");
    setMemberTab("profile");
    setFormOpen(true);
    setErrorMessage("");
    setSuccessMessage("");
  }

  async function openMember(member: Member, mode: "view" | "edit") {
    setFormOpen(true);
    setFormMode(mode);
    setMemberTab("profile");
    setSelectedId(member.id);
    setSelectedMember(member);
    setSelectedCreatedAt(member.createdAt);
    setFormNetworkId(member.networkId ?? "");
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await fetch(`/api/dashboard/members/${member.id}`);
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(getError(payload, "Não foi possível carregar o perfil."));
      }
      if (
        !payload ||
        typeof payload !== "object" ||
        !("member" in payload) ||
        !isMemberDetail(payload.member)
      ) {
        throw new Error("O servidor retornou um perfil inválido.");
      }

      const detail = payload.member;
      setMemberForm(formFromMember(detail));
      if (!("history" in payload) || !isHistoryList(payload.history)) {
        throw new Error("O servidor retornou um histórico inválido.");
      }
      setHistory(payload.history);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar o perfil."
      );
    }
  }

  async function saveMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (formMode === "view") {
      return;
    }
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    const payload = {
      ...memberForm,
      cellId: memberForm.cellId || null,
      email: memberForm.email.trim() || null,
      phone: memberForm.phone.trim() || null,
      maritalStatus: memberForm.maritalStatus.trim() || null,
    };

    try {
      const response = await fetch(
        formMode === "create"
          ? "/api/dashboard/members"
          : `/api/dashboard/members/${selectedId}`,
        {
          method: formMode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const result: unknown = await response.json();
      if (!response.ok) {
        throw new Error(getError(result, "Não foi possível salvar o membro."));
      }

      let warning = "";
      if (
        result &&
        typeof result === "object" &&
        "warning" in result &&
        typeof result.warning === "string"
      ) {
        warning = result.warning;
      }

      setSuccessMessage(
        warning ||
          (formMode === "create"
            ? "Membro cadastrado com sucesso."
            : "Membro atualizado com sucesso.")
      );
      setFormOpen(false);
      setFormMode("create");
      setSelectedId("");
      setSelectedMember(null);
      setPage(1);
      setLoading(true);
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o membro."
      );
    } finally {
      setSaving(false);
    }
  }

  const isReadOnly = formMode === "view";
  const memberStats = [
    {
      label: "Total de membros",
      value: data?.stats.total ?? "—",
      filter: "all",
    },
    {
      label: "Membros ativos",
      value: data?.stats.active ?? "—",
      filter: "active",
    },
    {
      label: "Membros inativos",
      value: data?.stats.inactive ?? "—",
      filter: "inactive",
    },
    {
      label: "Novos membros (30 dias)",
      value: data?.stats.newMembers ?? "—",
      filter: "new",
    },
  ] as const;

  function showMemberStat(filter: (typeof memberStats)[number]["filter"]) {
    setSearch("");
    setNetworkId("");
    setCellId("");
    setStatus(filter === "active" || filter === "inactive" ? filter : "");
    setPeriod(filter === "new" ? "30d" : "");
    setPage(1);
    setLoading(true);
    requestAnimationFrame(() =>
      document
        .getElementById("members-list")
        ?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  }

  return (
    <section className={styles.modulePage} aria-labelledby="members-title">
      <div className={styles.moduleHeading}>
        <div>
          <span className={styles.moduleEyebrow}>GESTÃO DA IGREJA</span>
          <h1 id="members-title">Membros</h1>
          <p>Gerencie e acompanhe os membros da igreja</p>
        </div>
        <button
          type="button"
          className={styles.modulePrimaryButton}
          onClick={startCreate}
        >
          Cadastrar membro
        </button>
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

      <div className={styles.memberStats}>
        {memberStats.map((stat) => (
          <button
            type="button"
            className={`${styles.moduleStat} ${styles.moduleStatButton}`}
            key={stat.label}
            onClick={() => showMemberStat(stat.filter)}
          >
            <span>{stat.label}</span>
            <strong>{loading ? "…" : stat.value}</strong>
          </button>
        ))}
      </div>

      {formOpen && (
        <form
          className={`${styles.moduleForm} ${
            isReadOnly ? styles.memberProfileForm : ""
          }`}
          onSubmit={saveMember}
        >
          <div className={styles.moduleFormHeading}>
            <div>
              <span className={styles.moduleEyebrow}>
                {formMode === "create"
                  ? "NOVO CADASTRO"
                  : formMode === "edit"
                    ? "ATUALIZAÇÃO"
                    : "PERFIL"}
              </span>
              <h2>
                {formMode === "create"
                  ? "Cadastrar membro"
                  : formMode === "edit"
                    ? "Editar membro"
                    : memberForm.fullName || "Perfil do membro"}
              </h2>
            </div>
            <button
              type="button"
              className={styles.moduleSecondaryButton}
              onClick={() => {
                setFormOpen(false);
                setFormMode("create");
                setSelectedId("");
                setSelectedMember(null);
              }}
            >
              Fechar
            </button>
          </div>

          {formMode === "view" && (
            <div className={styles.memberProfileTabs} role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={memberTab === "profile"}
                className={`${styles.settingsTab} ${
                  memberTab === "profile" ? styles.settingsTabActive : ""
                }`}
                onClick={() => setMemberTab("profile")}
              >
                Perfil
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={memberTab === "requirements"}
                className={`${styles.settingsTab} ${
                  memberTab === "requirements" ? styles.settingsTabActive : ""
                }`}
                onClick={() => setMemberTab("requirements")}
              >
                Requisitos
              </button>
            </div>
          )}

          {formMode === "view" &&
            memberTab === "profile" &&
            selectedMember && (
              <section
                className={styles.memberProfileDetails}
                aria-label="Dados do membro"
              >
                {[
                  ["Telefone", selectedMember.phone || "Não informado"],
                  ["E-mail", selectedMember.email || "Não informado"],
                  [
                    "Data de nascimento",
                    displayDate(selectedMember.birthDate),
                  ],
                  [
                    "Estado civil",
                    selectedMember.maritalStatus || "Não informado",
                  ],
                  ["Rede", selectedMember.networkName || "Não informado"],
                  ["Célula", selectedMember.cellName || "Não informado"],
                  [
                    "Líder responsável",
                    selectedMember.leaderName || "Não informado",
                  ],
                  [
                    "Cadastro",
                    displayDate(selectedCreatedAt ?? selectedMember.createdAt),
                  ],
                  ["Situação", selectedMember.isActive ? "Ativo" : "Inativo"],
                ].map(([label, value]) => (
                  <dl className={styles.memberProfileDetail} key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </dl>
                ))}
              </section>
            )}

          {(formMode !== "view" || memberTab === "profile") && (
            <>
          <h3 className={styles.moduleSectionTitle}>Dados pessoais</h3>
          <div className={styles.moduleFields}>
            <label className={styles.moduleField}>
              <span>Nome completo *</span>
              <input
                required
                maxLength={150}
                value={memberForm.fullName}
                disabled={isReadOnly}
                onChange={(event) =>
                  setMemberForm({ ...memberForm, fullName: event.target.value })
                }
              />
            </label>
            <label className={styles.moduleField}>
              <span>Telefone</span>
              <input
                type="tel"
                maxLength={40}
                autoComplete="tel"
                value={memberForm.phone}
                disabled={isReadOnly}
                onChange={(event) =>
                  setMemberForm({ ...memberForm, phone: event.target.value })
                }
              />
            </label>
            <label className={styles.moduleField}>
              <span>E-mail</span>
              <input
                type="email"
                autoComplete="email"
                value={memberForm.email}
                disabled={isReadOnly}
                onChange={(event) =>
                  setMemberForm({ ...memberForm, email: event.target.value })
                }
              />
            </label>
            <label className={styles.moduleField}>
              <span>Data de nascimento</span>
              <input
                type="date"
                value={memberForm.birthDate}
                disabled={isReadOnly}
                onChange={(event) =>
                  setMemberForm({ ...memberForm, birthDate: event.target.value })
                }
              />
            </label>
            <label className={styles.moduleField}>
              <span>Estado civil</span>
              <input
                maxLength={50}
                value={memberForm.maritalStatus}
                disabled={isReadOnly}
                onChange={(event) =>
                  setMemberForm({
                    ...memberForm,
                    maritalStatus: event.target.value,
                  })
                }
                placeholder="Ex.: solteiro(a)"
              />
            </label>
          </div>

          <h3 className={styles.moduleSectionTitle}>Informações eclesiásticas</h3>
          <div className={styles.moduleFields}>
            <label className={styles.moduleField}>
              <span>Rede</span>
              <select
                value={formNetworkId}
                onChange={(event) => {
                  setFormNetworkId(event.target.value);
                  setMemberForm({ ...memberForm, cellId: "" });
                }}
                disabled={isReadOnly}
              >
                <option value="">Todas as redes</option>
                {(data?.networks ?? []).map((network) => (
                  <option key={network.id} value={network.id}>
                    {network.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.moduleField}>
              <span>Célula</span>
              <select
                value={memberForm.cellId}
                disabled={isReadOnly}
                onChange={(event) =>
                  setMemberForm({ ...memberForm, cellId: event.target.value })
                }
              >
                <option value="">Sem célula</option>
                {formVisibleCells.map((cell) => (
                  <option key={cell.id} value={cell.id}>
                    {cell.name}
                    {!cell.isActive ? " (inativa)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.moduleField}>
              <span>Situação *</span>
              <select
                value={memberForm.isActive ? "active" : "inactive"}
                disabled={isReadOnly}
                onChange={(event) =>
                  setMemberForm({
                    ...memberForm,
                    isActive: event.target.value === "active",
                  })
                }
              >
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
              </select>
            </label>
          </div>
          <p className={styles.moduleNote}>
            O banco atual não possui campos para endereço, data de entrada na
            igreja ou observações.
          </p>

          {(formMode === "create" || formMode === "edit") && (
            <div className={styles.moduleFormActions}>
              <button
                type="button"
                className={styles.moduleSecondaryButton}
                onClick={() => setFormOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className={styles.modulePrimaryButton}
                disabled={saving}
              >
                {saving
                  ? "Salvando..."
                  : formMode === "create"
                    ? "Cadastrar membro"
                    : "Salvar alterações"}
              </button>
            </div>
          )}

          {formMode === "view" && selectedMember?.canEdit && (
            <div className={styles.moduleFormActions}>
              <button
                type="button"
                className={styles.modulePrimaryButton}
                aria-label={`Editar perfil do membro ${selectedMember.fullName}`}
                onClick={() => {
                  setMemberTab("profile");
                  setFormMode("edit");
                }}
              >
                Editar perfil do membro
              </button>
            </div>
          )}

          {formMode !== "create" && (
            <section className={styles.memberHistory}>
              <h3 className={styles.moduleSectionTitle}>Histórico de situação</h3>
              {history.length === 0 ? (
                <p className={styles.moduleNote}>
                  Nenhuma alteração de situação registrada.
                </p>
              ) : (
                <ol className={styles.historyList}>
                  {history.map((entry) => (
                    <li key={entry.id}>
                      <strong>
                        {entry.newStatus === "active" ? "Ativo" : "Inativo"}
                      </strong>
                      <span>
                        {entry.previousStatus
                          ? ` de ${
                              entry.previousStatus === "active"
                                ? "Ativo"
                                : "Inativo"
                            }`
                          : " (cadastro inicial)"}
                        {" · "}
                        {displayDate(entry.createdAt)}
                      </span>
                      <small>
                        {entry.changedBy}
                        {entry.reason ? ` — ${entry.reason}` : ""}
                      </small>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}
            </>
          )}

        </form>
      )}

      {formOpen &&
        formMode === "view" &&
        memberTab === "requirements" &&
        selectedId && (
          <MemberRequirements key={selectedId} memberId={selectedId} />
        )}

      <div className={styles.memberFilters}>
        <label className={styles.moduleSearch}>
          <span className={styles.moduleSrOnly}>Pesquisar membros</span>
          <input
            type="search"
            placeholder="Nome, telefone ou e-mail"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
              setLoading(true);
            }}
          />
        </label>
        <label className={styles.filterField}>
          <span className={styles.moduleSrOnly}>Filtrar por rede</span>
          <select
            value={networkId}
            onChange={(event) => {
              setNetworkId(event.target.value);
              setCellId("");
              setPage(1);
              setLoading(true);
            }}
          >
            <option value="">Todas as redes</option>
            {(data?.networks ?? []).map((network) => (
              <option key={network.id} value={network.id}>
                {network.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.filterField}>
          <span className={styles.moduleSrOnly}>Filtrar por célula</span>
          <select
            value={cellId}
            onChange={(event) => {
              setCellId(event.target.value);
              setPage(1);
              setLoading(true);
            }}
          >
            <option value="">Todas as células</option>
            {visibleCells.map((cell) => (
              <option key={cell.id} value={cell.id}>
                {cell.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.filterField}>
          <span className={styles.moduleSrOnly}>Filtrar por situação</span>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
              setLoading(true);
            }}
          >
            <option value="">Todas as situações</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
          </select>
        </label>
        <label className={styles.filterField}>
          <span className={styles.moduleSrOnly}>Filtrar por período</span>
          <select
            value={period}
            onChange={(event) => {
              setPeriod(event.target.value);
              setPage(1);
              setLoading(true);
            }}
          >
            <option value="">Qualquer período</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="90d">Últimos 90 dias</option>
            <option value="year">Este ano</option>
          </select>
        </label>
      </div>

      <div className={styles.moduleTableCard} id="members-list">
        {loading ? (
          <p className={styles.moduleEmpty}>Carregando membros...</p>
        ) : errorMessage && !data ? (
          <p className={styles.moduleEmpty}>
            Não foi possível exibir os membros.
          </p>
        ) : !data?.members.length ? (
          <p className={styles.moduleEmpty}>
            {data?.totalResults
              ? "Nenhum membro corresponde aos filtros."
              : "Nenhum membro cadastrado nesta área."}
          </p>
        ) : (
          <div className={styles.moduleTableScroll}>
            <table className={styles.moduleTable}>
              <thead>
                <tr>
                  <th>Membro</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {data.members.map((member) => (
                  <tr key={member.id}>
                    <td className={styles.memberListCell} data-label="Membro">
                      <div className={styles.memberListIdentity}>
                        <strong className={styles.moduleName}>
                          {member.fullName}
                        </strong>
                      </div>
                      <div
                        className={`${styles.moduleRowActions} ${styles.memberListActions}`}
                      >
                        <button
                          type="button"
                          className={styles.moduleTextButton}
                          onClick={() => void openMember(member, "view")}
                        >
                          Ver perfil
                        </button>
                        {member.canEdit && (
                          <button
                            type="button"
                            className={styles.moduleTextButton}
                            aria-label={`Editar perfil do membro ${member.fullName}`}
                            onClick={() => void openMember(member, "edit")}
                          >
                            Editar perfil
                          </button>
                        )}
                      </div>
                    </td>
                    <td data-label="Situação">
                      <span
                        className={`${styles.moduleBadge} ${
                          member.isActive
                            ? styles.moduleBadgeActive
                            : styles.moduleBadgeInactive
                        }`}
                      >
                        {member.isActive ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={styles.modulePagination}>
        <span>
          {data?.totalResults ?? 0} membro(s) · página {data?.page ?? page} de{" "}
          {Math.max(data?.totalPages ?? 0, 1)}
        </span>
        <div>
          <button
            type="button"
            className={styles.moduleSecondaryButton}
            disabled={page <= 1 || loading}
            onClick={() => {
              setLoading(true);
              setPage((current) => Math.max(1, current - 1));
            }}
          >
            Anterior
          </button>
          <button
            type="button"
            className={styles.moduleSecondaryButton}
            disabled={!data || page >= data.totalPages || loading}
            onClick={() => {
              setLoading(true);
              setPage((current) => current + 1);
            }}
          >
            Próxima
          </button>
        </div>
      </div>
    </section>
  );
}
