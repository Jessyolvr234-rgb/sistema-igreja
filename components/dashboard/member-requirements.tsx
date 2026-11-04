"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./dashboard.module.css";

type RequirementFieldType = "boolean" | "text" | "number" | "date" | "select";
type AnswerValue = boolean | number | string | null;
type AnswerHistory = {
  id: string;
  action: string;
  value: unknown;
  createdAt: string;
  updatedBy: string;
};
type RequirementAnswer = {
  id: string;
  value: AnswerValue;
  notes: string | null;
  updatedAt: string;
  completedAt: string | null;
  updatedBy: string;
  history: AnswerHistory[];
};
type MemberRequirement = {
  id: string;
  title: string;
  description: string | null;
  fieldType: RequirementFieldType;
  options: string[] | null;
  isRequired: boolean;
  isActive: boolean;
  createdAt: string;
  answer: RequirementAnswer | null;
};
type RequirementResponse = {
  requirements: MemberRequirement[];
  canUpdateAnswers: boolean;
};
type RequirementDraft = { value: AnswerValue; notes: string };
type Filter = "all" | "complete" | "pending";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function getError(value: unknown, fallback: string) {
  return isRecord(value) && typeof value.error === "string"
    ? value.error
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

function isAnswerValue(value: unknown): value is AnswerValue {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
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

function isRequirement(value: unknown): value is MemberRequirement {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    !(typeof value.description === "string" || value.description === null) ||
    !isFieldType(value.fieldType) ||
    !(
      value.options === null ||
      (Array.isArray(value.options) &&
        value.options.every((option) => typeof option === "string"))
    ) ||
    typeof value.isRequired !== "boolean" ||
    typeof value.isActive !== "boolean" ||
    typeof value.createdAt !== "string"
  ) {
    return false;
  }
  if (value.answer === null) return true;
  if (!isRecord(value.answer)) return false;
  return (
    typeof value.answer.id === "string" &&
    isAnswerValue(value.answer.value) &&
    (typeof value.answer.notes === "string" || value.answer.notes === null) &&
    typeof value.answer.updatedAt === "string" &&
    (typeof value.answer.completedAt === "string" ||
      value.answer.completedAt === null) &&
    typeof value.answer.updatedBy === "string" &&
    Array.isArray(value.answer.history) &&
    value.answer.history.every(isAnswerHistory)
  );
}

function parseResponse(value: unknown): RequirementResponse | null {
  if (
    !isRecord(value) ||
    !Array.isArray(value.requirements) ||
    !value.requirements.every(isRequirement) ||
    typeof value.canUpdateAnswers !== "boolean"
  ) {
    return null;
  }
  return {
    requirements: value.requirements,
    canUpdateAnswers: value.canUpdateAnswers,
  };
}

function isComplete(requirement: MemberRequirement, value: AnswerValue) {
  if (requirement.fieldType === "boolean") {
    return value === true;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  return value !== null;
}

function displayDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function valueToDraft(requirement: MemberRequirement): RequirementDraft {
  return {
    value: requirement.answer?.value ?? null,
    notes: requirement.answer?.notes ?? "",
  };
}

function displayValue(value: unknown) {
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (value === null || value === undefined || value === "") return "Pendente";
  return String(value);
}

export default function MemberRequirements({
  memberId,
}: {
  memberId: string;
}) {
  const [requirements, setRequirements] = useState<MemberRequirement[]>([]);
  const [canUpdateAnswers, setCanUpdateAnswers] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, RequirementDraft>>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const fetchRequirements = useCallback(async () => {
    const response = await fetch(
      `/api/dashboard/requirements?memberId=${encodeURIComponent(memberId)}`
    );
    const payload: unknown = await response.json();
    if (!response.ok) {
      throw new Error(
        getError(payload, "Não foi possível carregar os requisitos do membro.")
      );
    }
    const parsed = parseResponse(payload);
    if (!parsed) {
      throw new Error("O servidor retornou requisitos em formato inválido.");
    }
    return parsed;
  }, [memberId]);

  const applyRequirements = useCallback((responseData: RequirementResponse) => {
    setRequirements(responseData.requirements);
    setCanUpdateAnswers(responseData.canUpdateAnswers);
    setDrafts(
      Object.fromEntries(
        responseData.requirements.map((requirement) => [
          requirement.id,
          valueToDraft(requirement),
        ])
      )
    );
  }, []);

  useEffect(() => {
    let active = true;
    fetchRequirements()
      .then((responseData) => {
        if (active) {
          applyRequirements(responseData);
          setErrorMessage("");
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar os requisitos do membro."
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [applyRequirements, fetchRequirements]);

  const activeRequirements = useMemo(
    () => requirements.filter((requirement) => requirement.isActive),
    [requirements]
  );
  const completedCount = activeRequirements.filter((requirement) =>
    isComplete(requirement, drafts[requirement.id]?.value ?? null)
  ).length;
  const pendingCount = activeRequirements.length - completedCount;
  const filteredRequirements = activeRequirements.filter((requirement) => {
    const completed = isComplete(
      requirement,
      drafts[requirement.id]?.value ?? null
    );
    return (
      filter === "all" ||
      (filter === "complete" && completed) ||
      (filter === "pending" && !completed)
    );
  });
  const archivedRequirements = requirements.filter(
    (requirement) => !requirement.isActive && requirement.answer
  );

  function updateDraft(
    requirementId: string,
    changes: Partial<RequirementDraft>
  ) {
    setDrafts((current) => ({
      ...current,
      [requirementId]: {
        ...(current[requirementId] ?? { value: null, notes: "" }),
        ...changes,
      },
    }));
  }

  async function saveAnswer(requirement: MemberRequirement) {
    if (!canUpdateAnswers) {
      return;
    }
    const draft = drafts[requirement.id] ?? valueToDraft(requirement);
    setSavingId(requirement.id);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const response = await fetch("/api/dashboard/requirements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "answer",
          memberId,
          requirementId: requirement.id,
          value: draft.value,
          notes: draft.notes,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          getError(payload, "Não foi possível salvar a resposta individual.")
        );
      }
      const updated = await fetchRequirements();
      applyRequirements(updated);
      setSuccessMessage(`“${requirement.title}” atualizado para este membro.`);
      if (isRecord(payload) && typeof payload.warning === "string" && payload.warning) {
        setErrorMessage(payload.warning);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar a resposta individual."
      );
    } finally {
      setSavingId("");
    }
  }

  function renderAnswerControl(requirement: MemberRequirement) {
    const value = drafts[requirement.id]?.value ?? null;
    if (requirement.fieldType === "boolean") {
      return (
        <select
          aria-label={`Resposta para ${requirement.title}`}
          disabled={!canUpdateAnswers}
          value={value === true ? "yes" : value === false ? "no" : ""}
          onChange={(event) =>
            updateDraft(requirement.id, {
              value:
                event.target.value === "yes"
                  ? true
                  : event.target.value === "no"
                    ? false
                    : null,
            })
          }
        >
          <option value="">Pendente / sem resposta</option>
          <option value="yes">Sim — concluído</option>
          <option value="no">Não — pendente</option>
        </select>
      );
    }
    if (requirement.fieldType === "select") {
      return (
        <select
          aria-label={`Resposta para ${requirement.title}`}
          disabled={!canUpdateAnswers}
          value={typeof value === "string" ? value : ""}
          onChange={(event) =>
            updateDraft(requirement.id, { value: event.target.value || null })
          }
        >
          <option value="">Pendente / sem resposta</option>
          {(requirement.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    }
    if (requirement.fieldType === "text") {
      return (
        <textarea
          aria-label={`Resposta para ${requirement.title}`}
          disabled={!canUpdateAnswers}
          rows={2}
          maxLength={5000}
          value={typeof value === "string" ? value : ""}
          placeholder="Deixe vazio para marcar como pendente"
          onChange={(event) =>
            updateDraft(requirement.id, {
              value: event.target.value || null,
            })
          }
        />
      );
    }
    if (requirement.fieldType === "number") {
      return (
        <input
          aria-label={`Resposta para ${requirement.title}`}
          type="number"
          disabled={!canUpdateAnswers}
          value={typeof value === "number" ? value : ""}
          onChange={(event) =>
            updateDraft(requirement.id, {
              value:
                event.target.value === ""
                  ? null
                  : event.target.valueAsNumber,
            })
          }
        />
      );
    }
    return (
      <input
        aria-label={`Resposta para ${requirement.title}`}
        type="date"
        disabled={!canUpdateAnswers}
        value={typeof value === "string" ? value : ""}
        onChange={(event) =>
          updateDraft(requirement.id, { value: event.target.value || null })
        }
      />
    );
  }

  return (
    <section className={styles.memberRequirements} aria-labelledby="member-requirements-title">
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

      {loading ? (
        <p className={styles.moduleEmpty}>Carregando requisitos...</p>
      ) : (
        <>
          <div className={styles.memberRequirementStats}>
            {[
              ["Requisitos ativos", activeRequirements.length],
              ["Concluídos", completedCount],
              ["Pendentes", pendingCount],
              [
                "Conclusão",
                activeRequirements.length
                  ? `${Math.round(
                      (completedCount / activeRequirements.length) * 100
                    )}%`
                  : "0%",
              ],
            ].map(([label, value]) => (
              <article className={styles.moduleStat} key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </article>
            ))}
          </div>

          <div className={styles.memberRequirementHeading}>
            <div>
              <h3 id="member-requirements-title">Acompanhamento individual</h3>
              <p>
                As respostas são exclusivas deste membro; requisitos novos e
                ativos aparecem automaticamente.
              </p>
            </div>
            <label className={styles.moduleField}>
              <span>Mostrar</span>
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value as Filter)}
              >
                <option value="all">Todos</option>
                <option value="complete">Concluídos</option>
                <option value="pending">Pendentes</option>
              </select>
            </label>
          </div>
          <p className={styles.moduleNote}>
            A data de conclusão vem do histórico de auditoria; quando esse
            registro não existe, é usada a data da última atualização.
          </p>

          {!canUpdateAnswers && (
            <p className={styles.moduleNote}>
              Você pode consultar os requisitos deste membro, mas não tem permissão para alterá-los.
            </p>
          )}
          {filteredRequirements.length ? (
            <div className={styles.memberRequirementList}>
              {filteredRequirements.map((requirement) => {
                const draft = drafts[requirement.id] ?? valueToDraft(requirement);
                const complete = isComplete(requirement, draft.value);
                const changed =
                  draft.value !== (requirement.answer?.value ?? null) ||
                  draft.notes !== (requirement.answer?.notes ?? "");
                return (
                  <article
                    className={styles.memberRequirementCard}
                    key={requirement.id}
                  >
                    <div className={styles.memberRequirementTitle}>
                      <div>
                        <h4>{requirement.title}</h4>
                        {requirement.description && (
                          <p>{requirement.description}</p>
                        )}
                        {requirement.isRequired && (
                          <small>Requisito obrigatório</small>
                        )}
                      </div>
                      <span
                        className={`${styles.moduleBadge} ${
                          complete
                            ? styles.moduleBadgeActive
                            : styles.moduleBadgeInactive
                        }`}
                      >
                        {complete ? "Concluído" : "Pendente"}
                      </span>
                    </div>
                    <div className={styles.memberRequirementFields}>
                      <label className={styles.moduleField}>
                        <span>
                          {requirement.fieldType === "boolean"
                            ? "Resposta (sim/não)"
                            : "Resposta"}
                        </span>
                        {renderAnswerControl(requirement)}
                      </label>
                      <label className={styles.moduleField}>
                        <span>Observações</span>
                        <textarea
                          rows={2}
                          maxLength={1000}
                          value={draft.notes}
                          disabled={!canUpdateAnswers}
                          placeholder="Observações sobre este requisito"
                          onChange={(event) =>
                            updateDraft(requirement.id, {
                              notes: event.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                    <div className={styles.memberRequirementFooter}>
                      <span>
                        {complete
                          ? `Concluído em ${displayDate(
                              requirement.answer?.completedAt ??
                                requirement.answer?.updatedAt ??
                                null
                            )}`
                          : requirement.answer
                            ? `Atualizado em ${displayDate(
                                requirement.answer.updatedAt
                              )}`
                            : "Ainda sem resposta"}
                        {requirement.answer
                          ? ` · por ${requirement.answer.updatedBy}`
                          : ""}
                      </span>
                      <button
                        type="button"
                        className={styles.modulePrimaryButton}
                        disabled={
                          !canUpdateAnswers ||
                          !changed ||
                          savingId === requirement.id
                        }
                        onClick={() => void saveAnswer(requirement)}
                      >
                        {savingId === requirement.id
                          ? "Salvando..."
                          : "Salvar resposta"}
                      </button>
                    </div>
                    {requirement.answer?.history.length ? (
                      <details className={styles.memberRequirementHistory}>
                        <summary>
                          Histórico ({requirement.answer.history.length})
                        </summary>
                        <ol className={styles.historyList}>
                          {requirement.answer.history.map((entry) => (
                            <li key={entry.id}>
                              <strong>{displayValue(entry.value)}</strong>
                              <span>
                                {displayDate(entry.createdAt)} · {entry.updatedBy}
                              </span>
                            </li>
                          ))}
                        </ol>
                      </details>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <p className={styles.moduleEmpty}>
              {activeRequirements.length
                ? "Nenhum requisito corresponde ao filtro."
                : "Não há requisitos ativos cadastrados."}
            </p>
          )}

          {archivedRequirements.length > 0 && (
            <section className={styles.memberArchivedRequirements}>
              <h3>Respostas de requisitos desativados</h3>
              <p>
                Estes registros foram preservados e não contam nos requisitos
                ativos.
              </p>
              <ul className={styles.networkPeopleList}>
                {archivedRequirements.map((requirement) => (
                  <li key={requirement.id}>
                    <strong>{requirement.title}</strong>
                    <span>
                      Resposta: {displayValue(requirement.answer?.value)} ·{" "}
                      {displayDate(requirement.answer?.updatedAt ?? null)}
                    </span>
                    {requirement.answer?.notes && (
                      <small>{requirement.answer.notes}</small>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </section>
  );
}
