"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import styles from "./dashboard.module.css";
import type { DashboardRole } from "@/lib/supabase/dashboard-access";

type Cell = {
  id: string;
  name: string;
  networkId: string;
  networkName: string;
  canManage: boolean;
  leaderId: string | null;
  leaderName: string | null;
  isActive: boolean;
  createdAt: string;
  memberCount: number;
  members: {
    id: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    isActive: boolean;
  }[];
};

type CellsResponse = {
  cells: Cell[];
  networks: { id: string; name: string }[];
  leaders: { id: string; full_name: string }[];
  stats: { total: number; active: number; inactive: number; leaders: number };
};

type CellForm = {
  name: string;
  networkId: string;
  leaderId: string;
  isActive: boolean;
};

const emptyForm: CellForm = {
  name: "",
  networkId: "",
  leaderId: "",
  isActive: true,
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

function isCell(value: unknown): value is Cell {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "id" in value &&
    typeof value.id === "string" &&
    "name" in value &&
    typeof value.name === "string" &&
    "networkId" in value &&
    typeof value.networkId === "string" &&
    "networkName" in value &&
    typeof value.networkName === "string" &&
    "canManage" in value &&
    typeof value.canManage === "boolean" &&
    "leaderId" in value &&
    (typeof value.leaderId === "string" || value.leaderId === null) &&
    "leaderName" in value &&
    (typeof value.leaderName === "string" || value.leaderName === null) &&
    "isActive" in value &&
    typeof value.isActive === "boolean" &&
    "createdAt" in value &&
    typeof value.createdAt === "string" &&
    "memberCount" in value &&
    typeof value.memberCount === "number" &&
    "members" in value &&
    Array.isArray(value.members)
  );
}

function isCellsResponse(value: unknown): value is CellsResponse {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "cells" in value &&
    Array.isArray(value.cells) &&
    value.cells.every(isCell) &&
    "networks" in value &&
    Array.isArray(value.networks) &&
    value.networks.every(
      (item) =>
        item &&
        typeof item === "object" &&
        "id" in item &&
        typeof item.id === "string" &&
        "name" in item &&
        typeof item.name === "string"
    ) &&
    "leaders" in value &&
    Array.isArray(value.leaders) &&
    value.leaders.every(
      (item) =>
        item &&
        typeof item === "object" &&
        "id" in item &&
        typeof item.id === "string" &&
        "full_name" in item &&
        typeof item.full_name === "string"
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
    "leaders" in value.stats &&
    typeof value.stats.leaders === "number"
  );
}

export default function CellsManagement({
  role,
  initialStatus = "",
}: {
  role: DashboardRole;
  initialStatus?: "" | "active";
}) {
  const [data, setData] = useState<CellsResponse | null>(null);
  const [search, setSearch] = useState("");
  const [networkId, setNetworkId] = useState("");
  const [leaderId, setLeaderId] = useState("");
  const [status, setStatus] = useState<string>(initialStatus);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedCell, setSelectedCell] = useState<Cell | null>(null);
  const [form, setForm] = useState<CellForm>(emptyForm);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const canManage = role !== "leader";

  const loadCells = useCallback(async () => {
    const params = new URLSearchParams({
      ...(search.trim() ? { q: search.trim() } : {}),
      ...(networkId ? { networkId } : {}),
      ...(leaderId ? { leaderId } : {}),
      ...(status ? { status } : {}),
    });
    const response = await fetch(`/api/dashboard/cells?${params}`);
    const payload: unknown = await response.json();
    if (!response.ok) {
      throw new Error(getError(payload, "Não foi possível carregar as células."));
    }
    if (!isCellsResponse(payload)) {
      throw new Error("O servidor retornou uma lista de células inválida.");
    }
    return payload;
  }, [leaderId, networkId, search, status]);

  useEffect(() => {
    let active = true;
    loadCells()
      .then((payload) => {
        if (active) {
          setData(payload);
          setErrorMessage("");
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setData(null);
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar as células."
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
  }, [loadCells, refreshKey]);

  function startCreate() {
    setSelectedCell(null);
    setForm({ ...emptyForm, networkId: data?.networks[0]?.id ?? "" });
    setFormOpen(true);
    setErrorMessage("");
    setSuccessMessage("");
  }

  async function openDetails(cell: Cell) {
    setErrorMessage("");
    try {
      const response = await fetch(
        `/api/dashboard/cells?id=${encodeURIComponent(cell.id)}`
      );
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(getError(payload, "Não foi possível abrir os detalhes."));
      }
      if (
        !payload ||
        typeof payload !== "object" ||
        !("cell" in payload) ||
        !isCell(payload.cell)
      ) {
        throw new Error("O servidor retornou detalhes de célula inválidos.");
      }
      setSelectedCell(payload.cell);
      setFormOpen(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível abrir os detalhes."
      );
    }
  }

  function startEdit(cell: Cell) {
    setSelectedCell(cell);
    setForm({
      name: cell.name,
      networkId: cell.networkId,
      leaderId: cell.leaderId ?? "",
      isActive: cell.isActive,
    });
    setFormOpen(true);
    setErrorMessage("");
    setSuccessMessage("");
  }

  async function saveCell(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const response = await fetch("/api/dashboard/cells", {
        method: selectedCell ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          leaderId: form.leaderId || null,
          ...(selectedCell ? { id: selectedCell.id } : {}),
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(getError(payload, "Não foi possível salvar a célula."));
      }
      const warning =
        payload &&
        typeof payload === "object" &&
        "warning" in payload &&
        typeof payload.warning === "string"
          ? payload.warning
          : "";
      setSuccessMessage(
        warning ||
          (selectedCell
            ? "Célula atualizada com sucesso."
            : "Célula cadastrada com sucesso.")
      );
      setFormOpen(false);
      setLoading(true);
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar a célula."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.modulePage} aria-labelledby="cells-title">
      <div className={styles.moduleHeading}>
        <div>
          <span className={styles.moduleEyebrow}>GESTÃO DA IGREJA</span>
          <h1 id="cells-title">Células</h1>
          <p>Organize e acompanhe as células da igreja</p>
        </div>
        {canManage && (
          <button
            type="button"
            className={styles.modulePrimaryButton}
            onClick={startCreate}
          >
            Cadastrar célula
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
      {!loading && data && canManage && data.networks.length === 0 && (
        <p className={styles.moduleNote}>
          Não há redes disponíveis para vincular uma célula.{" "}
          <Link href="/dashboard/redes">Cadastre uma rede primeiro.</Link>
        </p>
      )}

      <div className={styles.memberStats}>
        {[
          ["Total de células", data?.stats.total ?? "—"],
          ["Células ativas", data?.stats.active ?? "—"],
          ["Células inativas", data?.stats.inactive ?? "—"],
          ["Líderes responsáveis", data?.stats.leaders ?? "—"],
        ].map(([label, value]) => (
          <article className={styles.moduleStat} key={label}>
            <span>{label}</span>
            <strong>{loading ? "…" : value}</strong>
          </article>
        ))}
      </div>

      {formOpen && (
        <form className={styles.moduleForm} onSubmit={saveCell}>
          <div className={styles.moduleFormHeading}>
            <div>
              <span className={styles.moduleEyebrow}>
                {selectedCell ? "ATUALIZAÇÃO" : "NOVO CADASTRO"}
              </span>
              <h2>{selectedCell ? "Editar célula" : "Cadastrar célula"}</h2>
            </div>
            <button
              type="button"
              className={styles.moduleSecondaryButton}
              onClick={() => setFormOpen(false)}
            >
              Fechar
            </button>
          </div>
          {data?.networks.length === 0 && (
            <div className={styles.moduleError} role="alert">
              A célula precisa pertencer a uma rede.{" "}
              <Link href="/dashboard/redes">
                Cadastre uma rede e depois volte para concluir este cadastro.
              </Link>
            </div>
          )}
          <div className={styles.moduleFields}>
            <label className={styles.moduleField}>
              <span>Nome da célula *</span>
              <input
                required
                maxLength={120}
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </label>
            <label className={styles.moduleField}>
              <span>Rede vinculada *</span>
              <select
                required
                value={form.networkId}
                onChange={(event) =>
                  setForm({ ...form, networkId: event.target.value })
                }
              >
                <option value="">Selecione uma rede</option>
                {(data?.networks ?? []).map((network) => (
                  <option key={network.id} value={network.id}>
                    {network.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.moduleField}>
              <span>Líder responsável</span>
              <select
                value={form.leaderId}
                onChange={(event) =>
                  setForm({ ...form, leaderId: event.target.value })
                }
              >
                <option value="">Sem líder vinculado</option>
                {(data?.leaders ?? []).map((leader) => (
                  <option key={leader.id} value={leader.id}>
                    {leader.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.moduleField}>
              <span>Situação *</span>
              <select
                value={form.isActive ? "active" : "inactive"}
                onChange={(event) =>
                  setForm({ ...form, isActive: event.target.value === "active" })
                }
              >
                <option value="active">Ativa</option>
                <option value="inactive">Inativa</option>
              </select>
            </label>
          </div>
          <p className={styles.moduleNote}>
            O banco atual só armazena nome, rede, líder e situação da célula.
            Descrição, local, dia/horário e data de início não podem ser salvos
            sem alteração do schema.
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
              disabled={saving || !data?.networks.length}
            >
              {saving
                ? "Salvando..."
                : !data?.networks.length
                  ? "Cadastre uma rede primeiro"
                : selectedCell
                  ? "Salvar alterações"
                  : "Cadastrar célula"}
            </button>
          </div>
        </form>
      )}

      {selectedCell && !formOpen && (
        <section className={styles.networkDetails} aria-labelledby="cell-details">
          <div className={styles.moduleFormHeading}>
            <div>
              <span className={styles.moduleEyebrow}>DETALHES DA CÉLULA</span>
              <h2 id="cell-details">{selectedCell.name}</h2>
            </div>
            <div className={styles.moduleRowActions}>
              {selectedCell.canManage && (
                <button
                  type="button"
                  className={styles.moduleSecondaryButton}
                  onClick={() => startEdit(selectedCell)}
                >
                  Editar
                </button>
              )}
              <button
                type="button"
                className={styles.moduleSecondaryButton}
                onClick={() => setSelectedCell(null)}
              >
                Fechar
              </button>
            </div>
          </div>
          <div className={styles.networkDetailStats}>
            <div>
              <span>Rede</span>
              <strong>{selectedCell.networkName}</strong>
            </div>
            <div>
              <span>Líder responsável</span>
              <strong>{selectedCell.leaderName ?? "Não informado"}</strong>
            </div>
            <div>
              <span>Membros</span>
              <strong>{selectedCell.memberCount}</strong>
            </div>
            <div>
              <span>Situação</span>
              <strong>{selectedCell.isActive ? "Ativa" : "Inativa"}</strong>
            </div>
          </div>
          <h3 className={styles.moduleSectionTitle}>Membros da célula</h3>
          {selectedCell.members.length ? (
            <ul className={styles.networkPeopleList}>
              {selectedCell.members.map((member) => (
                <li key={member.id}>
                  <strong>
                    {member.fullName}
                    {!member.isActive ? " (inativo)" : ""}
                  </strong>
                  <span>{member.phone || member.email || "Contato não informado"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.moduleNote}>Nenhum membro vinculado.</p>
          )}
        </section>
      )}

      <div className={styles.memberFilters}>
        <label className={styles.moduleSearch}>
          <span className={styles.moduleSrOnly}>Pesquisar células</span>
          <input
            type="search"
            placeholder="Buscar por nome da célula"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
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
          <span className={styles.moduleSrOnly}>Filtrar por líder</span>
          <select
            value={leaderId}
            onChange={(event) => {
              setLeaderId(event.target.value);
              setLoading(true);
            }}
          >
            <option value="">Todos os líderes</option>
            {(data?.leaders ?? []).map((leader) => (
              <option key={leader.id} value={leader.id}>
                {leader.full_name}
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
              setLoading(true);
            }}
          >
            <option value="">Todas as situações</option>
            <option value="active">Ativas</option>
            <option value="inactive">Inativas</option>
          </select>
        </label>
      </div>

      <div className={styles.moduleTableCard}>
        {loading ? (
          <p className={styles.moduleEmpty}>Carregando células...</p>
        ) : !data?.cells.length ? (
          <p className={styles.moduleEmpty}>Nenhuma célula encontrada.</p>
        ) : (
          <div className={styles.moduleTableScroll}>
            <table className={styles.moduleTable}>
              <thead>
                <tr>
                  <th>Célula</th>
                  <th>Rede</th>
                  <th>Líder responsável</th>
                  <th>Membros</th>
                  <th>Situação</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {data.cells.map((cell) => (
                  <tr key={cell.id}>
                    <td data-label="Célula">
                      <strong className={styles.moduleName}>{cell.name}</strong>
                    </td>
                    <td data-label="Rede">{cell.networkName}</td>
                    <td data-label="Líder">{cell.leaderName ?? "Não informado"}</td>
                    <td data-label="Membros">{cell.memberCount}</td>
                    <td data-label="Situação">
                      <span
                        className={`${styles.moduleBadge} ${
                          cell.isActive
                            ? styles.moduleBadgeActive
                            : styles.moduleBadgeInactive
                        }`}
                      >
                        {cell.isActive ? "Ativa" : "Inativa"}
                      </span>
                    </td>
                    <td data-label="Ações">
                      <div className={styles.moduleRowActions}>
                        <button
                          type="button"
                          className={styles.moduleTextButton}
                          onClick={() => void openDetails(cell)}
                        >
                          Detalhes
                        </button>
                        {cell.canManage && (
                          <button
                            type="button"
                            className={styles.moduleTextButton}
                            onClick={() => startEdit(cell)}
                          >
                            Editar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
