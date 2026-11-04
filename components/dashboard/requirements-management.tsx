"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import styles from "./dashboard.module.css";
import type { DashboardRole } from "@/lib/supabase/dashboard-access";

type RequirementFieldType = "boolean" | "text" | "number" | "date" | "select";
type AnswerValue = boolean | number | string | null;
type AnswerHistory = {
  id: string;
  action: string;
  value: unknown;
  createdAt: string;
  updatedBy: string;
};
type Requirement = {
  id: string;
  title: string;
  description: string | null;
  fieldType: RequirementFieldType;
  options: string[] | null;
  isRequired: boolean;
  isActive: boolean;
  createdAt: string;
  completedCount?: number;
  pendingCount?: number;
  answer?: {
    id: string;
    value: AnswerValue;
    notes: string | null;
    updatedAt: string;
    completedAt: string | null;
    updatedBy: string;
    history: AnswerHistory[];
  } | null;
};
type RequirementForm = {
  title: string;
  description: string;
  fieldType: RequirementFieldType;
  options: string;
  isRequired: boolean;
  isActive: boolean;
};
type MemberResult = {
  id: string;
  fullName: string;
  isActive: boolean;
  canUpdate: boolean;
};
type RequirementsResponse = {
  requirements: Requirement[];
  stats: {
    total: number;
    active: number;
    completed: number;
    pending: number;
    members: number;
  };
  canManage: boolean;
};

const emptyForm: RequirementForm = {
  title: "",
  description: "",
  fieldType: "boolean",
  options: "",
  isRequired: true,
  isActive: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function getError(payload: unknown, fallback: string) {
  return isRecord(payload) && typeof payload.error === "string"
    ? payload.error
    : fallback;
}

function isFieldType(value: unknown): value is RequirementFieldType {
  return (
    value === "boolean" ||
    value === "text" ||
    value === "number" ||
    value === "date" ||
    value === "select"
  );
}

function isAnswerHistory(value: unknown): value is AnswerHistory {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.action === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedBy === "string"
  );
}

function isMemberResult(value: unknown): value is MemberResult {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.fullName === "string" &&
    typeof value.isActive === "boolean" &&
    typeof value.canUpdate === "boolean"
  );
}

function isRequirement(value: unknown): value is Requirement {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    (typeof value.description === "string" || value.description === null) &&
    isFieldType(value.fieldType) &&
    (value.options === null ||
      (Array.isArray(value.options) &&
        value.options.every((option) => typeof option === "string"))) &&
    typeof value.isRequired === "boolean" &&
    typeof value.isActive === "boolean" &&
    typeof value.createdAt === "string" &&
    (value.completedCount === undefined ||
      typeof value.completedCount === "number") &&
    (value.pendingCount === undefined ||
      typeof value.pendingCount === "number") &&
    (value.answer === undefined ||
      value.answer === null ||
      (isRecord(value.answer) &&
        typeof value.answer.id === "string" &&
        (typeof value.answer.value === "string" ||
          typeof value.answer.value === "number" ||
          typeof value.answer.value === "boolean" ||
          value.answer.value === null) &&
        (typeof value.answer.notes === "string" ||
          value.answer.notes === null) &&
        typeof value.answer.updatedAt === "string" &&
        (typeof value.answer.completedAt === "string" ||
          value.answer.completedAt === null) &&
        typeof value.answer.updatedBy === "string" &&
        Array.isArray(value.answer.history) &&
        value.answer.history.every(isAnswerHistory)))
  );
}

function isRequirementsResponse(value: unknown): value is RequirementsResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.requirements) &&
    value.requirements.every(isRequirement) &&
    isRecord(value.stats) &&
    typeof value.stats.total === "number" &&
    typeof value.stats.active === "number" &&
    typeof value.stats.completed === "number" &&
    typeof value.stats.pending === "number" &&
    typeof value.stats.members === "number" &&
    typeof value.canManage === "boolean"
  );
}

function displayDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function displayValue(value: unknown) {
  if (typeof value === "boolean") {
    return value ? "Sim" : "Não";
  }
  if (value === null || value === undefined || value === "") {
    return "Pendente";
  }
  return String(value);
}

function answerIsComplete(requirement: Requirement) {
  const value = requirement.answer?.value;
  if (requirement.fieldType === "boolean") {
    return value === true;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  return value !== null && value !== undefined;
}

export default function RequirementsManagement({
  role,
}: {
  role: DashboardRole;
}) {
  const [data, setData] = useState<RequirementsResponse | null>(null);
  const [selectedMember, setSelectedMember] = useState<MemberResult | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberResults, setMemberResults] = useState<MemberResult[]>([]);
  const [memberRequirementFilter, setMemberRequirementFilter] = useState("");
  const [memberAnswerStatusFilter, setMemberAnswerStatusFilter] = useState("");
  const [selectedRequirementId, setSelectedRequirementId] = useState("");
  const [answerValue, setAnswerValue] = useState<AnswerValue>("");
  const [answerNotes, setAnswerNotes] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingRequirement, setEditingRequirement] =
    useState<Requirement | null>(null);
  const [form, setForm] = useState<RequirementForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [memberRefreshKey, setMemberRefreshKey] = useState(0);
  const canManage = role !== "leader";

  const loadRequirements = useCallback(async () => {
    const response = await fetch(
      selectedMember
        ? `/api/dashboard/requirements?memberId=${encodeURIComponent(selectedMember.id)}`
        : "/api/dashboard/requirements"
    );
    const payload: unknown = await response.json();
    if (!response.ok) {
      throw new Error(
        getError(payload, "Não foi possível carregar os requisitos.")
      );
    }
    if (!isRequirementsResponse(payload)) {
      throw new Error("O servidor retornou dados de requisitos inválidos.");
    }
    return payload;
  }, [selectedMember]);

  useEffect(() => {
    let active = true;
    loadRequirements()
      .then((payload) => {
        if (active) {
          setData(payload);
          setErrorMessage("");
          if (!selectedRequirementId && payload.requirements.length) {
            setSelectedRequirementId(payload.requirements[0].id);
          }
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setData(null);
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar os requisitos."
          );
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
  }, [loadRequirements, refreshKey, selectedRequirementId]);

  useEffect(() => {
    const term = memberSearch.trim();
    if (!term) {
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({
        memberSearch: term,
        ...(memberRequirementFilter
          ? { requirementId: memberRequirementFilter }
          : {}),
        ...(memberAnswerStatusFilter
          ? { answerStatus: memberAnswerStatusFilter }
          : {}),
      });
      fetch(`/api/dashboard/members?${params}`)
        .then(async (response) => {
          const payload: unknown = await response.json();
          if (!response.ok) {
            throw new Error(
              getError(payload, "Não foi possível pesquisar membros.")
            );
          }
          if (
            !isRecord(payload) ||
            !Array.isArray(payload.members) ||
            !payload.members.every(isMemberResult)
          ) {
            throw new Error("O servidor retornou membros inválidos.");
          }
          return payload.members;
        })
        .then((members) => {
          if (active) {
            setMemberResults(members);
            setErrorMessage("");
          }
        })
        .catch((error: unknown) => {
          if (active) {
            setErrorMessage(
              error instanceof Error
                ? error.message
                : "Não foi possível pesquisar membros."
            );
          }
        })
        .finally(() => {
          if (active) {
            setMembersLoading(false);
          }
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    memberAnswerStatusFilter,
    memberRefreshKey,
    memberRequirementFilter,
    memberSearch,
  ]);

  const selectedRequirement = useMemo(
    () =>
      (data?.requirements ?? []).find(
        (requirement) => requirement.id === selectedRequirementId
      ) ?? null,
    [data?.requirements, selectedRequirementId]
  );
  const filteredRequirements = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    return (data?.requirements ?? []).filter((requirement) => {
      const matchesQuery =
        !term || requirement.title.toLocaleLowerCase("pt-BR").includes(term);
      const matchesStatus =
        !statusFilter ||
        (statusFilter === "active"
          ? requirement.isActive
          : !requirement.isActive);
      const matchesType =
        !typeFilter || requirement.fieldType === typeFilter;
      return matchesQuery && matchesStatus && matchesType;
    });
  }, [data?.requirements, query, statusFilter, typeFilter]);

  function startCreate() {
    setEditingRequirement(null);
    setForm({ ...emptyForm });
    setFormOpen(true);
    setErrorMessage("");
    setSuccessMessage("");
  }

  function startEdit(requirement: Requirement) {
    setEditingRequirement(requirement);
    setForm({
      title: requirement.title,
      description: requirement.description ?? "",
      fieldType: requirement.fieldType,
      options: (requirement.options ?? []).join("\n"),
      isRequired: requirement.isRequired,
      isActive: requirement.isActive,
    });
    setFormOpen(true);
    setErrorMessage("");
    setSuccessMessage("");
  }

  async function saveRequirement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const response = await fetch("/api/dashboard/requirements", {
        method: editingRequirement ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          options:
            form.fieldType === "select"
              ? form.options.split("\n").map((option) => option.trim())
              : null,
          ...(editingRequirement ? { id: editingRequirement.id } : {}),
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          getError(payload, "Não foi possível salvar o requisito.")
        );
      }
      const warning =
        isRecord(payload) && typeof payload.warning === "string"
          ? payload.warning
          : "";
      setSuccessMessage(
        warning ||
          (editingRequirement
            ? "Requisito atualizado com sucesso."
            : "Requisito cadastrado com sucesso.")
      );
      setFormOpen(false);
      setLoading(true);
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o requisito."
      );
    } finally {
      setSaving(false);
    }
  }

  async function selectMember(member: MemberResult) {
    setSelectedMember(member);
    setMemberSearch("");
    setMemberResults([]);
    setSelectedRequirementId("");
    setAnswerValue("");
    setAnswerNotes("");
    setData(null);
    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");
  }

  function selectRequirement(requirement: Requirement | undefined) {
    if (!requirement) {
      return;
    }
    setSelectedRequirementId(requirement.id);
    const answer = requirement.answer;
    setAnswerValue(answer?.value ?? "");
    setAnswerNotes(answer?.notes ?? "");
  }

  async function saveAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMember || !selectedRequirement || !selectedMember.canUpdate) {
      setErrorMessage("Selecione um membro e um requisito.");
      return;
    }
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    let value: AnswerValue = answerValue;
    if (selectedRequirement.fieldType === "boolean") {
      if (answerValue !== true && answerValue !== false && answerValue !== "") {
        setSaving(false);
        setErrorMessage("Selecione sim, não ou pendente.");
        return;
      }
      value = answerValue === "" ? null : answerValue;
    } else if (selectedRequirement.fieldType === "number") {
      if (typeof answerValue === "string" && answerValue.trim()) {
        value = Number(answerValue);
      } else if (answerValue === "") {
        value = null;
      }
      if (
        value !== null &&
        (typeof value !== "number" || !Number.isFinite(value))
      ) {
        setSaving(false);
        setErrorMessage("Informe um número válido.");
        return;
      }
    } else if (answerValue === "") {
      value = null;
    } else if (typeof answerValue !== "string") {
      setSaving(false);
      setErrorMessage("A resposta deste requisito é inválida.");
      return;
    }

    try {
      const response = await fetch("/api/dashboard/requirements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "answer",
          memberId: selectedMember.id,
          requirementId: selectedRequirement.id,
          value,
          notes: answerNotes,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          getError(payload, "Não foi possível salvar a resposta.")
        );
      }
      const warning =
        isRecord(payload) && typeof payload.warning === "string"
          ? payload.warning
          : "";
      setSuccessMessage(warning || "Resposta registrada com sucesso.");
      setLoading(true);
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar a resposta."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.modulePage} aria-labelledby="requirements-title">
      <div className={styles.moduleHeading}>
        <div>
          <span className={styles.moduleEyebrow}>GESTÃO DA IGREJA</span>
          <h1 id="requirements-title">Requisitos</h1>
          <p>Acompanhe informações importantes dos membros</p>
        </div>
        {canManage && (
          <button
            type="button"
            className={styles.modulePrimaryButton}
            onClick={startCreate}
          >
            Cadastrar requisito
          </button>
        )}
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
        <button
          type="button"
          className={`${styles.moduleStat} ${styles.moduleStatButton}`}
          onClick={() => {
            setQuery("");
            setStatusFilter("");
            setTypeFilter("");
            requestAnimationFrame(() =>
              document
                .getElementById("requirements-list")
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            );
          }}
        >
          <span>Total de requisitos</span>
          <strong>{loading ? "…" : data?.stats.total ?? "—"}</strong>
        </button>
        {[
          ["Requisitos ativos", data?.stats.active ?? "—"],
          ["Respostas concluídas", data?.stats.completed ?? "—"],
          ["Pendências obrigatórias", data?.stats.pending ?? "—"],
        ].map(([label, value]) => (
          <article className={styles.moduleStat} key={label}>
            <span>{label}</span>
            <strong>{loading ? "…" : value}</strong>
          </article>
        ))}
      </div>

      {formOpen && (
        <form className={styles.moduleForm} onSubmit={saveRequirement}>
          <div className={styles.moduleFormHeading}>
            <div>
              <span className={styles.moduleEyebrow}>
                {editingRequirement ? "ATUALIZAÇÃO" : "NOVO CADASTRO"}
              </span>
              <h2>
                {editingRequirement
                  ? "Editar requisito"
                  : "Cadastrar requisito"}
              </h2>
            </div>
            <button
              type="button"
              className={styles.moduleSecondaryButton}
              onClick={() => setFormOpen(false)}
            >
              Fechar
            </button>
          </div>
          <div className={styles.moduleFields}>
            <label className={styles.moduleField}>
              <span>Nome do requisito *</span>
              <input
                required
                maxLength={180}
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
              />
            </label>
            <label className={styles.moduleField}>
              <span>Tipo de resposta *</span>
              <select
                value={form.fieldType}
                onChange={(event) => {
                  if (isFieldType(event.target.value)) {
                    setForm({ ...form, fieldType: event.target.value });
                  }
                }}
              >
                <option value="boolean">Sim ou não</option>
                <option value="text">Texto</option>
                <option value="number">Número</option>
                <option value="date">Data</option>
                <option value="select">Seleção de opções</option>
              </select>
            </label>
            <label className={`${styles.moduleField} ${styles.moduleFieldWide}`}>
              <span>Descrição</span>
              <textarea
                rows={3}
                maxLength={2000}
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
              />
            </label>
            {form.fieldType === "select" && (
              <label
                className={`${styles.moduleField} ${styles.moduleFieldWide}`}
              >
                <span>Opções (uma por linha) *</span>
                <textarea
                  required
                  rows={4}
                  value={form.options}
                  onChange={(event) =>
                    setForm({ ...form, options: event.target.value })
                  }
                />
              </label>
            )}
            <label className={styles.moduleField}>
              <span>Obrigatoriedade</span>
              <select
                value={form.isRequired ? "required" : "optional"}
                onChange={(event) =>
                  setForm({
                    ...form,
                    isRequired: event.target.value === "required",
                  })
                }
              >
                <option value="required">Obrigatório</option>
                <option value="optional">Opcional</option>
              </select>
            </label>
            <label className={styles.moduleField}>
              <span>Situação</span>
              <select
                value={form.isActive ? "active" : "inactive"}
                onChange={(event) =>
                  setForm({ ...form, isActive: event.target.value === "active" })
                }
              >
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
              </select>
            </label>
          </div>
          <p className={styles.moduleNote}>
            O schema atual não possui categoria. Não é possível categorizar
            requisitos sem alterar o banco.
          </p>
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
              {saving ? "Salvando..." : "Salvar requisito"}
            </button>
          </div>
        </form>
      )}

      <section className={styles.moduleForm} aria-labelledby="member-responses">
        <div className={styles.moduleFormHeading}>
          <div>
            <span className={styles.moduleEyebrow}>ACOMPANHAMENTO</span>
            <h2 id="member-responses">
              {selectedMember
                ? `Requisitos de ${selectedMember.fullName}`
                : "Respostas por membro"}
            </h2>
          </div>
          {selectedMember && (
            <button
              type="button"
              className={styles.moduleSecondaryButton}
              onClick={() => {
                setSelectedMember(null);
                setData(null);
                setLoading(true);
                setSelectedRequirementId("");
                setAnswerValue("");
                setAnswerNotes("");
              }}
            >
              Voltar para requisitos
            </button>
          )}
        </div>

        {!selectedMember ? (
          <>
            <div className={styles.requirementMemberFilters}>
              <label className={styles.moduleSearch}>
                <span className={styles.moduleSrOnly}>Pesquisar membro</span>
                <input
                  type="search"
                  placeholder="Pesquise por nome, telefone ou e-mail"
                  value={memberSearch}
                  onChange={(event) => {
                    setMemberSearch(event.target.value);
                    setMembersLoading(!!event.target.value.trim());
                    if (!event.target.value.trim()) {
                      setMemberResults([]);
                    }
                    setMemberRefreshKey((key) => key + 1);
                  }}
                />
              </label>
              <label className={styles.filterField}>
                <span className={styles.moduleSrOnly}>Filtrar requisito</span>
                <select
                  value={memberRequirementFilter}
                  onChange={(event) => {
                    setMemberRequirementFilter(event.target.value);
                    setMemberRefreshKey((key) => key + 1);
                    setMembersLoading(!!memberSearch.trim());
                  }}
                >
                  <option value="">Todos os requisitos</option>
                  {(data?.requirements ?? []).map((requirement) => (
                    <option key={requirement.id} value={requirement.id}>
                      {requirement.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.filterField}>
                <span className={styles.moduleSrOnly}>
                  Filtrar conclusão do requisito
                </span>
                <select
                  value={memberAnswerStatusFilter}
                  disabled={!memberRequirementFilter}
                  onChange={(event) => {
                    setMemberAnswerStatusFilter(event.target.value);
                    setMemberRefreshKey((key) => key + 1);
                    setMembersLoading(!!memberSearch.trim());
                  }}
                >
                  <option value="">Todos os estados</option>
                  <option value="complete">Concluídos</option>
                  <option value="pending">Pendentes</option>
                </select>
              </label>
            </div>
            {membersLoading && (
              <p className={styles.moduleNote}>Pesquisando membros...</p>
            )}
            {!!memberResults.length && (
              <ul className={styles.requirementMemberResults}>
                {memberResults.map((member) => (
                  <li key={member.id}>
                    <span>
                      {member.fullName}
                      {!member.isActive ? " (inativo)" : ""}
                    </span>
                    <button
                      type="button"
                      className={styles.moduleTextButton}
                      onClick={() => void selectMember(member)}
                    >
                      Abrir requisitos
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : loading ? (
          <p className={styles.moduleEmpty}>Carregando respostas...</p>
        ) : data?.requirements.length ? (
          <>
            <div className={styles.moduleFields}>
              <label className={styles.moduleField}>
                <span>Requisito</span>
                <select
                  value={selectedRequirementId}
                  onChange={(event) =>
                    selectRequirement(
                      data.requirements.find(
                        (item) => item.id === event.target.value
                      ) ?? data.requirements[0]
                    )
                  }
                >
                  {data.requirements.map((requirement) => (
                    <option key={requirement.id} value={requirement.id}>
                      {requirement.title}
                      {!requirement.isActive ? " (inativo)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              {selectedRequirement && (
                <div className={styles.moduleField}>
                  <span>Situação</span>
                  <strong className={styles.requirementState}>
                    {selectedRequirement.answer &&
                    answerIsComplete(selectedRequirement)
                      ? "Concluído"
                      : "Pendente"}
                  </strong>
                </div>
              )}
            </div>
            {selectedRequirement?.answer && (
              <div className={styles.requirementCurrentAnswer}>
                <span>Resposta atual</span>
                <strong>
                  {displayValue(selectedRequirement.answer.value)}
                </strong>
                <small>
                  Atualizado em {displayDate(selectedRequirement.answer.updatedAt)} por{" "}
                  {selectedRequirement.answer.updatedBy}
                </small>
              </div>
            )}
            {selectedRequirement?.isActive && selectedMember.canUpdate && (
              <form className={styles.moduleForm} onSubmit={saveAnswer}>
                <h3 className={styles.moduleSectionTitle}>
                  {selectedRequirement.isRequired ? "Resposta *" : "Resposta"}
                </h3>
                {selectedRequirement.fieldType === "boolean" ? (
                  <label className={styles.moduleField}>
                    <span>Resposta</span>
                    <select
                      value={
                        answerValue === true
                          ? "yes"
                          : answerValue === false
                            ? "no"
                            : ""
                      }
                      onChange={(event) =>
                        setAnswerValue(
                          event.target.value === "yes"
                            ? true
                            : event.target.value === "no"
                              ? false
                              : ""
                        )
                      }
                    >
                      <option value="">Selecione</option>
                      <option value="yes">Sim</option>
                      <option value="no">Não</option>
                    </select>
                  </label>
                ) : selectedRequirement.fieldType === "select" ? (
                  <label className={styles.moduleField}>
                    <span>Resposta</span>
                    <select
                      value={typeof answerValue === "string" ? answerValue : ""}
                      onChange={(event) => setAnswerValue(event.target.value)}
                    >
                      <option value="">Selecione</option>
                      {(selectedRequirement.options ?? []).map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : selectedRequirement.fieldType === "text" ? (
                  <label className={styles.moduleField}>
                    <span>Resposta</span>
                    <textarea
                      maxLength={5000}
                      rows={3}
                      value={typeof answerValue === "string" ? answerValue : ""}
                      onChange={(event) => setAnswerValue(event.target.value)}
                    />
                  </label>
                ) : (
                  <label className={styles.moduleField}>
                    <span>Resposta</span>
                    <input
                      type={
                        selectedRequirement.fieldType === "number"
                          ? "number"
                          : "date"
                      }
                      value={
                        typeof answerValue === "string" ||
                        typeof answerValue === "number"
                          ? String(answerValue)
                          : ""
                      }
                      onChange={(event) =>
                        setAnswerValue(
                          selectedRequirement.fieldType === "number"
                            ? event.target.value === ""
                              ? ""
                              : event.target.valueAsNumber
                            : event.target.value
                        )
                      }
                    />
                  </label>
                )}
                <label className={styles.moduleField}>
                  <span>Observação</span>
                  <textarea
                    rows={2}
                    maxLength={1000}
                    value={answerNotes}
                    onChange={(event) => setAnswerNotes(event.target.value)}
                  />
                </label>
                <div className={styles.moduleFormActions}>
                  <button
                    type="submit"
                    className={styles.modulePrimaryButton}
                    disabled={saving}
                  >
                    {saving ? "Salvando..." : "Salvar resposta"}
                  </button>
                </div>
              </form>
            )}
            {selectedRequirement?.isActive && !selectedMember.canUpdate && (
              <p className={styles.moduleNote}>
                Você pode consultar esta resposta, mas não tem permissão para alterá-la.
              </p>
            )}
            {selectedRequirement?.answer?.history.length ? (
              <section className={styles.memberHistory}>
                <h3 className={styles.moduleSectionTitle}>
                  Histórico de respostas
                </h3>
                <ol className={styles.historyList}>
                  {selectedRequirement.answer.history.map((entry) => (
                    <li key={entry.id}>
                      <strong>{displayValue(entry.value)}</strong>
                      <span>
                        {displayDate(entry.createdAt)} · {entry.updatedBy} ·{" "}
                        {entry.action.endsWith("created")
                          ? "Cadastro"
                          : "Atualização"}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
          </>
        ) : (
          <p className={styles.moduleEmpty}>
            Nenhum requisito está cadastrado.
          </p>
        )}
      </section>

      <section
        className={styles.modulePage}
        id="requirements-list"
        aria-label="Lista de requisitos"
      >
        <div className={styles.memberFilters}>
          <label className={styles.moduleSearch}>
            <span className={styles.moduleSrOnly}>Pesquisar requisitos</span>
            <input
              type="search"
              placeholder="Buscar requisito"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label className={styles.filterField}>
            <span className={styles.moduleSrOnly}>Filtrar situação</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">Todas as situações</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
            </select>
          </label>
          <label className={styles.filterField}>
            <span className={styles.moduleSrOnly}>Filtrar tipo</span>
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
            >
              <option value="">Todos os tipos</option>
              <option value="boolean">Sim ou não</option>
              <option value="text">Texto</option>
              <option value="number">Número</option>
              <option value="date">Data</option>
              <option value="select">Seleção</option>
            </select>
          </label>
        </div>
        {loading && !selectedMember ? (
          <p className={styles.moduleEmpty}>Carregando requisitos...</p>
        ) : filteredRequirements.length ? (
          <div className={styles.moduleTableCard}>
            <div className={styles.moduleTableScroll}>
              <table className={styles.moduleTable}>
                <thead>
                  <tr>
                    <th>Requisito</th>
                    <th>Tipo</th>
                    <th>Obrigatório</th>
                    <th>Situação</th>
                    <th>Conclusões</th>
                    <th>Pendências</th>
                    <th>Criado em</th>
                    {canManage && <th>Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredRequirements.map((requirement) => (
                    <tr key={requirement.id}>
                      <td data-label="Requisito">
                        <strong className={styles.moduleName}>
                          {requirement.title}
                        </strong>
                        {requirement.description && (
                          <small className={styles.moduleSubtext}>
                            {requirement.description}
                          </small>
                        )}
                      </td>
                      <td data-label="Tipo">
                        {requirement.fieldType === "boolean"
                          ? "Sim ou não"
                          : requirement.fieldType === "select"
                            ? "Seleção"
                            : requirement.fieldType === "date"
                              ? "Data"
                              : requirement.fieldType === "number"
                                ? "Número"
                                : "Texto"}
                      </td>
                      <td data-label="Obrigatório">
                        {requirement.isRequired ? "Sim" : "Não"}
                      </td>
                      <td data-label="Situação">
                        <span
                          className={`${styles.moduleBadge} ${
                            requirement.isActive
                              ? styles.moduleBadgeActive
                              : styles.moduleBadgeInactive
                          }`}
                        >
                          {requirement.isActive ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td data-label="Conclusões">
                        {requirement.completedCount ?? "—"}
                      </td>
                      <td data-label="Pendências">
                        {requirement.pendingCount ?? "—"}
                      </td>
                      <td data-label="Criado em">
                        {displayDate(requirement.createdAt)}
                      </td>
                      {canManage && (
                        <td data-label="Ações">
                          <button
                            type="button"
                            className={styles.moduleTextButton}
                            onClick={() => startEdit(requirement)}
                          >
                            Editar
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className={styles.moduleEmpty}>
            {data?.requirements.length
              ? "Nenhum requisito corresponde aos filtros."
              : "Nenhum requisito cadastrado."}
          </p>
        )}
      </section>
    </section>
  );
}
