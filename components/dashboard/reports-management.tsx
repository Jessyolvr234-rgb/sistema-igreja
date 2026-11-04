"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./dashboard.module.css";

type ReportFilters = {
  from: string;
  to: string;
  networkId: string;
  cellId: string;
  status: string;
};
type ReportData = {
  generatedAt: string;
  filters: {
    from: string;
    to: string;
    networkId: string | null;
    cellId: string | null;
    status: string;
  };
  stats: {
    totalMembers: number;
    activeMembers: number;
    inactiveMembers: number;
    totalNetworks: number;
    totalCells: number;
    totalSupervisors: number;
    totalLeaders: number;
    newMembers: number;
    averageAttendance: number;
  };
  memberGrowth: { month: string; total: number }[];
  networks: {
    id: string;
    name: string;
    isActive: boolean;
    cellCount: number;
    activeCellCount: number;
    memberCount: number;
    activeMembers: number;
    supervisors: string[];
  }[];
  networkOptions: { id: string; name: string }[];
  cellOptions: { id: string; name: string; networkId: string }[];
  cells: {
    id: string;
    name: string;
    networkId: string;
    networkName: string;
    leaderName: string;
    isActive: boolean;
    memberCount: number;
    activeMembers: number;
    newMembers: number;
  }[];
  attendance: {
    id: string;
    date: string;
    title: string;
    networkName: string;
    cellName: string;
    total: number;
    present: number;
    absent: number;
    justified: number;
    percentage: number;
  }[];
  attendanceByMonth: {
    month: string;
    meetings: number;
    present: number;
    absent: number;
    justified: number;
    percentage: number;
  }[];
  frequentAbsences: { memberId: string; fullName: string; absences: number }[];
  requirements: {
    id: string;
    title: string;
    isActive: boolean;
    isRequired: boolean;
    completed: number;
    pending: number;
    percentage: number;
  }[];
  requirementStats: { completed: number; pending: number };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function getError(payload: unknown, fallback: string) {
  return isRecord(payload) && typeof payload.error === "string"
    ? payload.error
    : fallback;
}

function isReportData(value: unknown): value is ReportData {
  if (!isRecord(value)) {
    return false;
  }
  const stats = value.stats;
  const filters = value.filters;
  const requirementStats = value.requirementStats;
  if (!isRecord(stats) || !isRecord(filters) || !isRecord(requirementStats)) {
    return false;
  }
  const statKeys = [
    "totalMembers",
    "activeMembers",
    "inactiveMembers",
    "totalNetworks",
    "totalCells",
    "totalSupervisors",
    "totalLeaders",
    "newMembers",
    "averageAttendance",
  ] as const;
  return (
    typeof value.generatedAt === "string" &&
    statKeys.every((key) => typeof stats[key] === "number") &&
    typeof filters.from === "string" &&
    typeof filters.to === "string" &&
    (typeof filters.networkId === "string" ||
      filters.networkId === null) &&
    (typeof filters.cellId === "string" || filters.cellId === null) &&
    typeof filters.status === "string" &&
    Array.isArray(value.memberGrowth) &&
    Array.isArray(value.networks) &&
    Array.isArray(value.networkOptions) &&
    Array.isArray(value.cellOptions) &&
    Array.isArray(value.cells) &&
    Array.isArray(value.attendance) &&
    Array.isArray(value.attendanceByMonth) &&
    Array.isArray(value.frequentAbsences) &&
    Array.isArray(value.requirements) &&
    typeof requirementStats.completed === "number" &&
    typeof requirementStats.pending === "number"
  );
}

function displayDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function displayMonth(value: string) {
  const date = new Date(`${value}-01T00:00:00.000Z`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("pt-BR", {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      });
}

function escapeCsv(value: unknown) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replaceAll('"', '""')}"`;
}

export default function ReportsManagement() {
  const [filters, setFilters] = useState<ReportFilters>({
    from: "",
    to: "",
    networkId: "",
    cellId: "",
    status: "",
  });
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const loadReports = useCallback(async () => {
    const params = new URLSearchParams({
      ...(filters.from ? { from: filters.from } : {}),
      ...(filters.to ? { to: filters.to } : {}),
      ...(filters.networkId ? { networkId: filters.networkId } : {}),
      ...(filters.cellId ? { cellId: filters.cellId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    });
    const response = await fetch(`/api/dashboard/reports?${params}`);
    const payload: unknown = await response.json();
    if (!response.ok) {
      throw new Error(
        getError(payload, "Não foi possível gerar os relatórios.")
      );
    }
    if (!isReportData(payload)) {
      throw new Error("O servidor retornou dados de relatório inválidos.");
    }
    return payload;
  }, [filters]);

  useEffect(() => {
    let active = true;
    loadReports()
      .then((report) => {
        if (active) {
          setData(report);
          setFilters((current) => ({
            ...current,
            from: current.from || report.filters.from,
            to: current.to || report.filters.to,
          }));
          setErrorMessage("");
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setData(null);
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Não foi possível gerar os relatórios."
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
  }, [loadReports]);

  const availableCells = useMemo(
    () =>
      (data?.cellOptions ?? []).filter(
        (cell) => !filters.networkId || cell.networkId === filters.networkId
      ),
    [data?.cellOptions, filters.networkId]
  );

  function updateFilter(key: keyof ReportFilters, value: string) {
    setFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === "networkId" ? { cellId: "" } : {}),
    }));
    setLoading(true);
  }

  function exportCsv() {
    if (!data) {
      return;
    }
    const rows: unknown[][] = [
      ["Relatório", "Filtro/Data", "Indicador", "Valor"],
      ["Geração", data.generatedAt, "Gerado em", displayDate(data.generatedAt)],
      ["Filtros", "Período", `${data.filters.from} até ${data.filters.to}`, ""],
      ["Filtros", "Rede", filters.networkId || "Todas", ""],
      ["Filtros", "Célula", filters.cellId || "Todas", ""],
      ["Filtros", "Situação", filters.status || "Todas", ""],
      ...Object.entries(data.stats).map(([key, value]) => [
        "Indicadores",
        "",
        key,
        value,
      ]),
      ...data.memberGrowth.map((item) => [
        "Crescimento de membros",
        item.month,
        "Novos membros",
        item.total,
      ]),
      ...data.networks.map((network) => [
        "Redes",
        network.name,
        "Células / Membros / Supervisores",
        `${network.cellCount} / ${network.memberCount} / ${network.supervisors.join("; ")}`,
      ]),
      ...data.cells.map((cell) => [
        "Células",
        cell.name,
        "Rede / Líder / Membros / Novos",
        `${cell.networkName} / ${cell.leaderName} / ${cell.memberCount} / ${cell.newMembers}`,
      ]),
      ...data.attendance.map((meeting) => [
        "Frequência",
        `${meeting.date} · ${meeting.cellName}`,
        "Marcados / Presentes / Ausentes / Justificados / %",
        `${meeting.total} / ${meeting.present} / ${meeting.absent} / ${meeting.justified} / ${meeting.percentage}%`,
      ]),
      ...data.requirements.map((requirement) => [
        "Requisitos",
        requirement.title,
        "Concluídos / Pendentes / %",
        `${requirement.completed} / ${requirement.pending} / ${requirement.percentage}%`,
      ]),
    ];
    const content = `\uFEFF${rows
      .map((row) => row.map(escapeCsv).join(","))
      .join("\r\n")}`;
    const file = new Blob([content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = `relatorios-gestao-igreja-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const maxGrowth = Math.max(
    1,
    ...(data?.memberGrowth ?? []).map((item) => item.total)
  );
  const activeCellCount = data?.cells.filter((cell) => cell.isActive).length ?? 0;

  return (
    <section className={styles.modulePage} aria-labelledby="reports-title">
      <div className={styles.moduleHeading}>
        <div>
          <span className={styles.moduleEyebrow}>GESTÃO DA IGREJA</span>
          <h1 id="reports-title">Relatórios</h1>
          <p>Indicadores para acompanhar membros, redes, células e frequência</p>
        </div>
        <div className={styles.reportActions}>
          <button
            type="button"
            className={styles.moduleSecondaryButton}
            onClick={() => window.print()}
            disabled={!data}
          >
            Imprimir / PDF
          </button>
          <button
            type="button"
            className={styles.modulePrimaryButton}
            onClick={exportCsv}
            disabled={!data}
          >
            Exportar CSV
          </button>
        </div>
      </div>

      <p className={styles.moduleNote}>
        Os dados respeitam sua rede autorizada. Para PDF, use “Imprimir / PDF” e
        selecione “Salvar como PDF” no navegador. CSV pode ser aberto no Excel.
      </p>

      {errorMessage && (
        <div className={styles.moduleError} role="alert">
          {errorMessage}
        </div>
      )}

      <div className={styles.reportFilters}>
        <label className={styles.moduleField}>
          <span>De</span>
          <input
            type="date"
            value={filters.from}
            onChange={(event) => updateFilter("from", event.target.value)}
          />
        </label>
        <label className={styles.moduleField}>
          <span>Até</span>
          <input
            type="date"
            value={filters.to}
            onChange={(event) => updateFilter("to", event.target.value)}
          />
        </label>
        <label className={styles.moduleField}>
          <span>Rede</span>
          <select
            value={filters.networkId}
            onChange={(event) => updateFilter("networkId", event.target.value)}
          >
            <option value="">Todas as redes</option>
            {(data?.networkOptions ?? []).map((network) => (
              <option key={network.id} value={network.id}>
                {network.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.moduleField}>
          <span>Célula</span>
          <select
            value={filters.cellId}
            onChange={(event) => updateFilter("cellId", event.target.value)}
          >
            <option value="">Todas as células</option>
            {availableCells.map((cell) => (
              <option key={cell.id} value={cell.id}>
                {cell.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.moduleField}>
          <span>Situação do membro</span>
          <select
            value={filters.status}
            onChange={(event) => updateFilter("status", event.target.value)}
          >
            <option value="">Todas</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
          </select>
        </label>
      </div>

      <p className={styles.reportGenerated}>
        {data
          ? `Gerado em ${new Date(data.generatedAt).toLocaleString("pt-BR")}. Período: ${displayDate(data.filters.from)} a ${displayDate(data.filters.to)}.`
          : "Os relatórios serão gerados com dados reais do sistema."}
      </p>

      {loading && !data ? (
        <p className={styles.moduleEmpty}>Gerando relatórios...</p>
      ) : data ? (
        <>
          <div className={styles.reportMetrics}>
            {[
              ["Membros", data.stats.totalMembers],
              ["Membros ativos", data.stats.activeMembers],
              ["Membros inativos", data.stats.inactiveMembers],
              ["Novos no período", data.stats.newMembers],
              ["Redes", data.stats.totalNetworks],
              ["Células", data.stats.totalCells],
              ["Supervisores", data.stats.totalSupervisors],
              ["Líderes", data.stats.totalLeaders],
              ["Média de frequência", `${data.stats.averageAttendance}%`],
            ].map(([label, value]) => (
              <article className={styles.moduleStat} key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </article>
            ))}
          </div>

          <div className={styles.reportGrid}>
            <section className={styles.moduleForm}>
              <h2>Crescimento de membros</h2>
              <div className={styles.reportBars}>
                {data.memberGrowth.map((item) => (
                  <div className={styles.reportBar} key={item.month}>
                    <div className={styles.reportBarValue}>{item.total}</div>
                    <div className={styles.reportBarTrack}>
                      <span
                        style={{
                          height: `${Math.max(3, (item.total / maxGrowth) * 100)}%`,
                        }}
                      />
                    </div>
                    <small>{displayMonth(item.month)}</small>
                  </div>
                ))}
              </div>
            </section>

            <section className={styles.moduleForm}>
              <h2>Frequência mensal</h2>
              <div className={styles.reportBars}>
                {data.attendanceByMonth.map((item) => (
                  <div className={styles.reportBar} key={item.month}>
                    <div className={styles.reportBarValue}>
                      {item.percentage}%
                    </div>
                    <div className={styles.reportBarTrack}>
                      <span
                        style={{
                          height: `${Math.max(3, item.percentage)}%`,
                        }}
                      />
                    </div>
                    <small>{displayMonth(item.month)}</small>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className={styles.moduleForm}>
            <h2>Redes</h2>
            <div className={styles.moduleTableCard}>
              <div className={styles.moduleTableScroll}>
                <table className={styles.moduleTable}>
                  <thead>
                    <tr>
                      <th>Rede</th>
                      <th>Situação</th>
                      <th>Células ativas / total</th>
                      <th>Membros ativos / total</th>
                      <th>Supervisores</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.networks.map((network) => (
                      <tr key={network.id}>
                        <td data-label="Rede">{network.name}</td>
                        <td data-label="Situação">
                          {network.isActive ? "Ativa" : "Inativa"}
                        </td>
                        <td data-label="Células">
                          {network.activeCellCount} / {network.cellCount}
                        </td>
                        <td data-label="Membros">
                          {network.activeMembers} / {network.memberCount}
                        </td>
                        <td data-label="Supervisores">
                          {network.supervisors.join(", ") || "Não informado"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className={styles.moduleForm}>
            <h2>Células</h2>
            <p className={styles.moduleNote}>
              {activeCellCount} célula(s) ativa(s) no filtro atual.
            </p>
            <div className={styles.moduleTableCard}>
              <div className={styles.moduleTableScroll}>
                <table className={styles.moduleTable}>
                  <thead>
                    <tr>
                      <th>Célula</th>
                      <th>Rede</th>
                      <th>Líder</th>
                      <th>Situação</th>
                      <th>Membros</th>
                      <th>Novos no período</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.cells.map((cell) => (
                      <tr key={cell.id}>
                        <td data-label="Célula">{cell.name}</td>
                        <td data-label="Rede">{cell.networkName}</td>
                        <td data-label="Líder">{cell.leaderName}</td>
                        <td data-label="Situação">
                          {cell.isActive ? "Ativa" : "Inativa"}
                        </td>
                        <td data-label="Membros">
                          {cell.activeMembers} ativos / {cell.memberCount}
                        </td>
                        <td data-label="Novos">{cell.newMembers}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className={styles.moduleForm}>
            <h2>Frequência por reunião</h2>
            {data.frequentAbsences.length > 0 && (
              <p className={styles.moduleNote}>
                Membros com três ou mais ausências no período estão listados
                abaixo.
              </p>
            )}
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
                    </tr>
                  </thead>
                  <tbody>
                    {data.attendance.slice(0, 100).map((meeting) => (
                      <tr key={meeting.id}>
                        <td data-label="Data">{displayDate(meeting.date)}</td>
                        <td data-label="Rede">{meeting.networkName}</td>
                        <td data-label="Célula">{meeting.cellName}</td>
                        <td data-label="Marcados">{meeting.total}</td>
                        <td data-label="Presentes">{meeting.present}</td>
                        <td data-label="Ausentes">{meeting.absent}</td>
                        <td data-label="Justificados">{meeting.justified}</td>
                        <td data-label="Frequência">{meeting.percentage}%</td>
                      </tr>
                    ))}
                    {!data.attendance.length && (
                      <tr>
                        <td colSpan={8} className={styles.moduleEmpty}>
                          Sem reuniões registradas no período.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            {!!data.frequentAbsences.length && (
              <ul className={styles.networkPeopleList}>
                {data.frequentAbsences.map((member) => (
                  <li key={member.memberId}>
                    <strong>{member.fullName}</strong>
                    <span>{member.absences} ausências</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.moduleForm}>
            <h2>Requisitos</h2>
            <p className={styles.moduleNote}>
              {data.requirementStats.completed} respostas concluídas ·{" "}
              {data.requirementStats.pending} pendências obrigatórias.
            </p>
            <div className={styles.moduleTableCard}>
              <div className={styles.moduleTableScroll}>
                <table className={styles.moduleTable}>
                  <thead>
                    <tr>
                      <th>Requisito</th>
                      <th>Situação</th>
                      <th>Obrigatório</th>
                      <th>Concluídos</th>
                      <th>Pendentes</th>
                      <th>Conclusão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.requirements.map((requirement) => (
                      <tr key={requirement.id}>
                        <td data-label="Requisito">{requirement.title}</td>
                        <td data-label="Situação">
                          {requirement.isActive ? "Ativo" : "Inativo"}
                        </td>
                        <td data-label="Obrigatório">
                          {requirement.isRequired ? "Sim" : "Não"}
                        </td>
                        <td data-label="Concluídos">
                          {requirement.completed}
                        </td>
                        <td data-label="Pendentes">{requirement.pending}</td>
                        <td data-label="Conclusão">
                          {requirement.percentage}%
                        </td>
                      </tr>
                    ))}
                    {!data.requirements.length && (
                      <tr>
                        <td colSpan={6} className={styles.moduleEmpty}>
                          Nenhum requisito cadastrado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <p className={styles.moduleNote}>
              O schema de requisitos não possui categoria; esse filtro não está
              disponível.
            </p>
          </section>
        </>
      ) : (
        <div className={styles.moduleEmpty}>
          Não foi possível carregar os relatórios com os filtros selecionados.
        </div>
      )}
    </section>
  );
}
