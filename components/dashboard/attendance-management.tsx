"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./dashboard.module.css";
import type { DashboardRole } from "@/lib/supabase/dashboard-access";

type AttendanceStatus = "present" | "absent" | "justified";
type AttendanceSelection = AttendanceStatus | "";

type CellOption = {
  id: string;
  name: string;
  networkId: string;
  canRecord: boolean;
};
type NetworkOption = { id: string; name: string };
type RosterMember = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  status: string;
};
type MeetingSummary = {
  id: string;
  title: string;
  notes: string | null;
  date: string;
  networkId: string;
  networkName: string;
  cellId: string;
  cellName: string;
  totalMembers: number;
  present: number;
  absent: number;
  justified: number;
  percentage: number;
};
type HistoryDetail = {
  id: string;
  memberId: string;
  memberName: string;
  status: string;
  notes: string | null;
};

function getError(payload: unknown, fallback: string) {
  return payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    "error" in payload &&
    typeof payload.error === "string"
    ? payload.error
    : fallback;
}

function localDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function displayDate(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : parsed.toLocaleDateString("pt-BR");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isRosterMember(value: unknown): value is RosterMember {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.fullName === "string" &&
    (typeof value.email === "string" || value.email === null) &&
    (typeof value.phone === "string" || value.phone === null) &&
    typeof value.status === "string"
  );
}

function isRosterPayload(
  value: unknown
): value is {
  members: RosterMember[];
  meeting: unknown;
  canRecordAttendance: boolean;
} {
  return (
    isRecord(value) &&
    Array.isArray(value.members) &&
    value.members.every(isRosterMember) &&
    "meeting" in value &&
    typeof value.canRecordAttendance === "boolean"
  );
}

function isAttendanceStatus(value: string): value is AttendanceStatus {
  return value === "present" || value === "absent" || value === "justified";
}

function parseAttendanceSelection(value: string): AttendanceSelection {
  return value === "" || isAttendanceStatus(value) ? value : "";
}

function isNetworkOption(value: unknown): value is NetworkOption {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string"
  );
}

function isCellOption(value: unknown): value is CellOption {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.networkId === "string" &&
    typeof value.canRecord === "boolean"
  );
}

function isHistoryDetail(value: unknown): value is HistoryDetail {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.memberId === "string" &&
    typeof value.memberName === "string" &&
    typeof value.status === "string" &&
    (typeof value.notes === "string" || value.notes === null)
  );
}

function isMeetingSummary(value: unknown): value is MeetingSummary {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    (typeof value.notes === "string" || value.notes === null) &&
    typeof value.date === "string" &&
    typeof value.networkId === "string" &&
    typeof value.networkName === "string" &&
    typeof value.cellId === "string" &&
    typeof value.cellName === "string" &&
    typeof value.totalMembers === "number" &&
    typeof value.present === "number" &&
    typeof value.absent === "number" &&
    typeof value.justified === "number" &&
    typeof value.percentage === "number"
  );
}

export default function AttendanceManagement({
  role,
}: {
  role: DashboardRole;
}) {
  const [networks, setNetworks] = useState<NetworkOption[]>([]);
  const [cells, setCells] = useState<CellOption[]>([]);
  const [networkId, setNetworkId] = useState("");
  const [cellId, setCellId] = useState("");
  const [date, setDate] = useState(() => localDateString(new Date()));
  const [roster, setRoster] = useState<RosterMember[]>([]);
  const [canRecordAttendance, setCanRecordAttendance] = useState(false);
  const [statuses, setStatuses] = useState<
    Record<string, AttendanceSelection>
  >({});
  const [notes, setNotes] = useState("");
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [historyNetworkId, setHistoryNetworkId] = useState("");
  const [historyCellId, setHistoryCellId] = useState("");
  const [historyDetail, setHistoryDetail] = useState<HistoryDetail[] | null>(
    null
  );
  const [historyMeetingTitle, setHistoryMeetingTitle] = useState("");
  const [historyMemberSearch, setHistoryMemberSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const canCorrect = role !== "leader";

  const filteredCells = useMemo(
    () => cells.filter((cell) => cell.networkId === networkId),
    [cells, networkId]
  );
  const historyCells = useMemo(
    () =>
      historyNetworkId
        ? cells.filter((cell) => cell.networkId === historyNetworkId)
        : cells,
    [cells, historyNetworkId]
  );
  const filteredMeetings = useMemo(
    () =>
      meetings.filter(
        (meeting) =>
          (!historyNetworkId || meeting.networkId === historyNetworkId) &&
          (!historyCellId || meeting.cellId === historyCellId)
      ),
    [historyCellId, historyNetworkId, meetings]
  );
  const filteredHistoryDetail = useMemo(() => {
    const term = historyMemberSearch.trim().toLocaleLowerCase("pt-BR");
    return (historyDetail ?? []).filter(
      (entry) =>
        !term || entry.memberName.toLocaleLowerCase("pt-BR").includes(term)
    );
  }, [historyDetail, historyMemberSearch]);

  const loadHistory = useCallback(async () => {
    const params = new URLSearchParams({
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(historyNetworkId ? { networkId: historyNetworkId } : {}),
    });
    const response = await fetch(`/api/dashboard/attendance?${params}`);
    const payload: unknown = await response.json();
    if (!response.ok) {
      throw new Error(
        getError(payload, "Não foi possível carregar o histórico de frequência.")
      );
    }
    if (
      !isRecord(payload) ||
      !Array.isArray(payload.networks) ||
      !payload.networks.every(isNetworkOption) ||
      !Array.isArray(payload.cells) ||
      !payload.cells.every(isCellOption) ||
      !Array.isArray(payload.meetings) ||
      !payload.meetings.every(isMeetingSummary)
    ) {
      throw new Error("O servidor retornou um histórico de frequência inválido.");
    }
    return {
      networks: payload.networks,
      cells: payload.cells,
      meetings: payload.meetings,
    };
  }, [from, historyNetworkId, to]);

  useEffect(() => {
    let active = true;
    loadHistory()
      .then((data) => {
        if (active) {
          setNetworks(data.networks);
          setCells(data.cells);
          setMeetings(data.meetings);
          setErrorMessage("");
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar os dados de frequência."
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
  }, [loadHistory, refreshKey]);

  useEffect(() => {
    if (!cellId || !date) {
      return;
    }
    let active = true;
    const params = new URLSearchParams({ cellId, date });
    fetch(`/api/dashboard/attendance?${params}`)
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok) {
          throw new Error(
            getError(payload, "Não foi possível carregar os membros.")
          );
        }
        if (!isRosterPayload(payload)) {
          throw new Error("O servidor retornou uma lista de membros inválida.");
        }
        return payload;
      })
      .then((payload) => {
        if (active) {
          const nextRoster = payload.members;
          const nextStatuses: Record<string, AttendanceSelection> = {};
          for (const member of nextRoster) {
            if (!member.status) {
              nextStatuses[member.id] = "";
            } else if (isAttendanceStatus(member.status)) {
              nextStatuses[member.id] = member.status;
            } else {
              throw new Error(
                "Existe uma situação de frequência antiga não reconhecida. Consulte o administrador."
              );
            }
          }
          setRoster(nextRoster);
          setCanRecordAttendance(payload.canRecordAttendance);
          setStatuses(nextStatuses);
          setNotes(
            payload.meeting &&
              isRecord(payload.meeting) &&
              typeof payload.meeting.description === "string"
              ? payload.meeting.description
              : ""
          );
          setErrorMessage("");
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setRoster([]);
          setStatuses({});
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar os membros."
          );
        }
      })
      .finally(() => {
        if (active) {
          setRosterLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [cellId, date]);

  async function saveAttendance() {
    if (!cellId || !networkId || !date || roster.length === 0) {
      setErrorMessage("Selecione uma rede, célula e data com membros ativos.");
      return;
    }
    if (!canRecordAttendance) {
      setErrorMessage("Você pode consultar esta frequência, mas não tem permissão para registrá-la.");
      return;
    }
    if (roster.some((member) => !statuses[member.id])) {
      setErrorMessage("Marque uma situação para cada membro antes de salvar.");
      return;
    }
    if (
      !window.confirm(
        `Salvar a frequência de ${roster.length} membro(s) em ${displayDate(date)}?`
      )
    ) {
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const response = await fetch("/api/dashboard/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          networkId,
          cellId,
          date,
          notes,
          attendance: roster.map((member) => ({
            memberId: member.id,
            status: statuses[member.id],
          })),
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(getError(payload, "Não foi possível salvar a frequência."));
      }
      const warning =
        isRecord(payload) && typeof payload.warning === "string"
          ? payload.warning
          : "";
      setSuccessMessage(warning || "Frequência salva com sucesso.");
      setLoading(true);
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar a frequência."
      );
    } finally {
      setSaving(false);
    }
  }

  async function openMeeting(meeting: MeetingSummary) {
    setErrorMessage("");
    try {
      const response = await fetch(
        `/api/dashboard/attendance?meetingId=${encodeURIComponent(meeting.id)}`
      );
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          getError(payload, "Não foi possível abrir os registros da reunião.")
        );
      }
      if (
        !isRecord(payload) ||
        !Array.isArray(payload.attendance) ||
        !payload.attendance.every(isHistoryDetail)
      ) {
        throw new Error("O servidor retornou registros de frequência inválidos.");
      }
      setHistoryDetail(payload.attendance);
      setHistoryMeetingTitle(`${meeting.cellName} · ${displayDate(meeting.date)}`);
      setHistoryMemberSearch("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível abrir os registros."
      );
    }
  }

  const presentCount = Object.values(statuses).filter(
    (status) => status === "present"
  ).length;
  const absentCount = Object.values(statuses).filter(
    (status) => status === "absent"
  ).length;
  const justifiedCount = Object.values(statuses).filter(
    (status) => status === "justified"
  ).length;

  return (
    <section className={styles.modulePage} aria-labelledby="attendance-title">
      <div className={styles.moduleHeading}>
        <div>
          <span className={styles.moduleEyebrow}>GESTÃO DA IGREJA</span>
          <h1 id="attendance-title">Frequência</h1>
          <p>Registre e acompanhe a participação nas reuniões</p>
        </div>
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

      <section className={styles.moduleForm} aria-labelledby="register-title">
        <div className={styles.moduleFormHeading}>
          <div>
            <span className={styles.moduleEyebrow}>NOVA REUNIÃO</span>
            <h2 id="register-title">Registrar frequência</h2>
          </div>
        </div>
        <div className={styles.moduleFields}>
          <label className={styles.moduleField}>
            <span>Rede *</span>
            <select
              value={networkId}
              onChange={(event) => {
                setNetworkId(event.target.value);
                setCellId("");
                setCanRecordAttendance(false);
                setRoster([]);
                setStatuses({});
                setNotes("");
                setRosterLoading(false);
              }}
            >
              <option value="">Selecione uma rede</option>
              {networks.map((network) => (
                <option key={network.id} value={network.id}>
                  {network.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.moduleField}>
            <span>Célula *</span>
            <select
              value={cellId}
              disabled={!networkId}
              onChange={(event) => {
                setCellId(event.target.value);
                setCanRecordAttendance(false);
                setRoster([]);
                setStatuses({});
                setNotes("");
                setRosterLoading(!!event.target.value);
              }}
            >
              <option value="">Selecione uma célula</option>
              {filteredCells.map((cell) => (
                <option key={cell.id} value={cell.id}>
                  {cell.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.moduleField}>
            <span>Data da reunião *</span>
            <input
              type="date"
              required
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                setCanRecordAttendance(false);
                setRoster([]);
                setStatuses({});
                setNotes("");
                setRosterLoading(!!cellId && !!event.target.value);
              }}
            />
          </label>
          <label className={`${styles.moduleField} ${styles.moduleFieldWide}`}>
            <span>Observações da reunião</span>
            <textarea
              maxLength={2000}
              rows={2}
              value={notes}
              disabled={!canRecordAttendance}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Informações relevantes sobre a reunião"
            />
          </label>
        </div>

        {cellId && (
          <>
            <div className={styles.moduleAttendanceSummary}>
              <span>{roster.length} membro(s) ativo(s)</span>
              <span>Presentes: {presentCount}</span>
              <span>Ausentes: {absentCount}</span>
              <span>Justificados: {justifiedCount}</span>
              <button
                type="button"
                className={styles.moduleSecondaryButton}
                disabled={!roster.length || rosterLoading || !canRecordAttendance}
                onClick={() =>
                  setStatuses(
                    roster.reduce<Record<string, AttendanceSelection>>(
                      (all, member) => {
                        all[member.id] = "present";
                        return all;
                      },
                      {}
                    )
                    )
                }
              >
                Marcar todos como presentes
              </button>
            </div>
            {rosterLoading ? (
              <p className={styles.moduleEmpty}>Carregando membros...</p>
            ) : roster.length === 0 ? (
              <p className={styles.moduleEmpty}>
                Não há membros ativos nesta célula.
              </p>
            ) : (
              <div className={styles.moduleTableCard}>
                <div className={styles.moduleTableScroll}>
                  <table className={styles.moduleTable}>
                    <thead>
                      <tr>
                        <th>Membro</th>
                        <th>Contato</th>
                        <th>Situação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roster.map((member) => (
                        <tr key={member.id}>
                          <td data-label="Membro">
                            <strong className={styles.moduleName}>
                              {member.fullName}
                            </strong>
                          </td>
                          <td data-label="Contato">
                            {member.phone || member.email || "—"}
                          </td>
                          <td data-label="Situação">
                            <select
                              className={styles.moduleAttendanceSelect}
                              aria-label={`Frequência de ${member.fullName}`}
                              value={statuses[member.id] ?? ""}
                              disabled={!canRecordAttendance}
                              onChange={(event) =>
                                setStatuses({
                                  ...statuses,
                                  [member.id]: parseAttendanceSelection(
                                    event.target.value
                                  ),
                                })
                              }
                            >
                              <option value="">Selecione</option>
                              <option value="present">Presente</option>
                              <option value="absent">Ausente</option>
                              <option value="justified">Justificado</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {roster.length > 0 && (
              <div className={styles.moduleFormActions}>
                {!canCorrect && (
                  <p className={styles.moduleNote}>
                    Líderes podem registrar a frequência uma vez; correções de
                    registros existentes exigem administrador ou supervisor.
                  </p>
                )}
                {!canRecordAttendance && (
                  <p className={styles.moduleNote}>
                    Você pode consultar a frequência, mas não pode alterá-la nesta célula.
                  </p>
                )}
                <button
                  type="button"
                  className={styles.modulePrimaryButton}
                  disabled={saving || rosterLoading || !canRecordAttendance}
                  onClick={() => void saveAttendance()}
                >
                  {saving ? "Salvando..." : "Salvar frequência"}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <section className={styles.moduleForm} aria-labelledby="history-title">
        <div className={styles.moduleFormHeading}>
          <div>
            <span className={styles.moduleEyebrow}>CONSULTA</span>
            <h2 id="history-title">Histórico de frequência</h2>
          </div>
        </div>
        <div className={styles.moduleAttendanceFilters}>
          <label className={styles.moduleField}>
            <span>De</span>
            <input
              type="date"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value);
                setLoading(true);
              }}
            />
          </label>
          <label className={styles.moduleField}>
            <span>Até</span>
            <input
              type="date"
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
                setLoading(true);
              }}
            />
          </label>
          <label className={styles.moduleField}>
            <span>Rede</span>
            <select
              value={historyNetworkId}
              onChange={(event) => {
                setHistoryNetworkId(event.target.value);
                setHistoryCellId("");
                setLoading(true);
              }}
            >
              <option value="">Todas</option>
              {networks.map((network) => (
                <option key={network.id} value={network.id}>
                  {network.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.moduleField}>
            <span>Célula</span>
            <select
              value={historyCellId}
              onChange={(event) => setHistoryCellId(event.target.value)}
            >
              <option value="">Todas</option>
              {historyCells.map((cell) => (
                <option key={cell.id} value={cell.id}>
                  {cell.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {historyDetail && (
          <section className={styles.networkDetails}>
            <div className={styles.moduleFormHeading}>
              <div>
                <span className={styles.moduleEyebrow}>
                  REGISTROS INDIVIDUAIS
                </span>
                <h3>{historyMeetingTitle}</h3>
              </div>
              <button
                type="button"
                className={styles.moduleSecondaryButton}
                onClick={() => setHistoryDetail(null)}
              >
                Fechar
              </button>
            </div>
            <label className={styles.moduleSearch}>
              <span className={styles.moduleSrOnly}>Pesquisar membro</span>
              <input
                type="search"
                placeholder="Filtrar por membro"
                value={historyMemberSearch}
                onChange={(event) => setHistoryMemberSearch(event.target.value)}
              />
            </label>
            <div className={styles.moduleTableCard}>
              <div className={styles.moduleTableScroll}>
                <table className={styles.moduleTable}>
                  <thead>
                    <tr>
                      <th>Membro</th>
                      <th>Situação</th>
                      <th>Observação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistoryDetail.map((entry) => (
                      <tr key={entry.id}>
                        <td data-label="Membro">{entry.memberName}</td>
                        <td data-label="Situação">
                          {entry.status === "present"
                            ? "Presente"
                            : entry.status === "absent"
                              ? "Ausente"
                              : entry.status === "justified"
                                ? "Justificado"
                                : entry.status}
                        </td>
                        <td data-label="Observação">{entry.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
        {loading ? (
          <p className={styles.moduleEmpty}>Carregando histórico...</p>
        ) : filteredMeetings.length === 0 ? (
          <p className={styles.moduleEmpty}>
            Nenhuma reunião registrada no período selecionado.
          </p>
        ) : (
          <div className={styles.moduleTableCard}>
            <div className={styles.moduleTableScroll}>
              <table className={styles.moduleTable}>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Rede</th>
                    <th>Célula</th>
                    <th>Marcados</th>
                    <th>Presentes</th>
                    <th>Ausentes</th>
                    <th>Justificados</th>
                    <th>Frequência</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMeetings.map((meeting) => (
                    <tr key={meeting.id}>
                      <td data-label="Data">{displayDate(meeting.date)}</td>
                      <td data-label="Rede">{meeting.networkName}</td>
                      <td data-label="Célula">{meeting.cellName}</td>
                      <td data-label="Marcados">{meeting.totalMembers}</td>
                      <td data-label="Presentes">{meeting.present}</td>
                      <td data-label="Ausentes">{meeting.absent}</td>
                      <td data-label="Justificados">{meeting.justified}</td>
                      <td data-label="Frequência">{meeting.percentage}%</td>
                      <td data-label="Ações">
                        <button
                          type="button"
                          className={styles.moduleTextButton}
                          onClick={() => void openMeeting(meeting)}
                        >
                          Ver membros
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </section>
  );
}
