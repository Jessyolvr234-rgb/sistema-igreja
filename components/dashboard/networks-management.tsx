"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import styles from "./dashboard.module.css";

type Supervisor = {
  id: string;
  fullName: string;
  email: string | null;
};

type Cell = {
  id: string;
  name: string;
  leaderId: string | null;
  leaderName: string | null;
  isActive: boolean;
  createdAt: string;
  memberCount: number;
};

type Network = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  supervisors: Supervisor[];
  cells: Cell[];
  cellCount: number;
  memberCount: number;
};

type NetworksResponse = {
  networks: Network[];
  canManage: boolean;
  supervisors: Supervisor[];
  stats: { total: number; active: number; cells: number };
};

type NetworkForm = {
  name: string;
  description: string;
  supervisorIds: string[];
  isActive: boolean;
};

function isSupervisor(value: unknown): value is Supervisor {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "id" in value &&
    typeof value.id === "string" &&
    "fullName" in value &&
    typeof value.fullName === "string" &&
    "email" in value &&
    (typeof value.email === "string" || value.email === null)
  );
}

const emptyForm: NetworkForm = {
  name: "",
  description: "",
  supervisorIds: [],
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
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString("pt-BR", { timeZone: "UTC" })
    : "—";
}

function isNetwork(value: unknown): value is Network {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return (
    "id" in value &&
    typeof value.id === "string" &&
    "name" in value &&
    typeof value.name === "string" &&
    "description" in value &&
    (typeof value.description === "string" || value.description === null) &&
    "isActive" in value &&
    typeof value.isActive === "boolean" &&
    "createdAt" in value &&
    typeof value.createdAt === "string" &&
    "supervisors" in value &&
    Array.isArray(value.supervisors) &&
    value.supervisors.every(isSupervisor) &&
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
        "leaderId" in cell &&
        (typeof cell.leaderId === "string" || cell.leaderId === null) &&
        "leaderName" in cell &&
        (typeof cell.leaderName === "string" || cell.leaderName === null) &&
        "isActive" in cell &&
        typeof cell.isActive === "boolean" &&
        "createdAt" in cell &&
        typeof cell.createdAt === "string" &&
        "memberCount" in cell &&
        typeof cell.memberCount === "number"
    ) &&
    "cellCount" in value &&
    typeof value.cellCount === "number" &&
    "memberCount" in value &&
    typeof value.memberCount === "number"
  );
}

function isNetworksResponse(value: unknown): value is NetworksResponse {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "networks" in value &&
    Array.isArray(value.networks) &&
    value.networks.every(isNetwork) &&
    "canManage" in value &&
    typeof value.canManage === "boolean" &&
    "supervisors" in value &&
    Array.isArray(value.supervisors) &&
    value.supervisors.every(isSupervisor) &&
    "stats" in value &&
    !!value.stats &&
    typeof value.stats === "object" &&
    "total" in value.stats &&
    typeof value.stats.total === "number" &&
    "active" in value.stats &&
    typeof value.stats.active === "number" &&
    "cells" in value.stats &&
    typeof value.stats.cells === "number"
  );
}

export default function NetworksManagement() {
  const [data, setData] = useState<NetworksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [selectedNetwork, setSelectedNetwork] = useState<Network | null>(null);
  const [form, setForm] = useState<NetworkForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const loadNetworks = useCallback(async () => {
    const response = await fetch("/api/dashboard/networks");
    const payload: unknown = await response.json();
    if (!response.ok) {
      throw new Error(getError(payload, "Não foi possível carregar as redes."));
    }

    if (!isNetworksResponse(payload)) {
      throw new Error("O servidor retornou uma lista de redes inválida.");
    }
    return payload;
  }, []);

  useEffect(() => {
    let active = true;
    loadNetworks()
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
              : "Não foi possível carregar as redes."
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
  }, [loadNetworks, refreshKey]);

  const filteredNetworks = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return (data?.networks ?? []).filter((network) => {
      const matchesSearch =
        !term || network.name.toLocaleLowerCase("pt-BR").includes(term);
      const matchesStatus =
        !status ||
        (status === "active" ? network.isActive : !network.isActive);
      return matchesSearch && matchesStatus;
    });
  }, [data?.networks, search, status]);

  function startCreate() {
    setSelectedNetwork(null);
    setForm({ ...emptyForm });
    setFormMode("create");
    setFormOpen(true);
    setErrorMessage("");
    setSuccessMessage("");
  }

  async function openDetails(network: Network) {
    setErrorMessage("");
    try {
      const response = await fetch(
        `/api/dashboard/networks?id=${encodeURIComponent(network.id)}`
      );
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(getError(payload, "Não foi possível abrir os detalhes."));
      }
      if (
        !payload ||
        typeof payload !== "object" ||
        !("network" in payload) ||
        !isNetwork(payload.network)
      ) {
        throw new Error("O servidor retornou detalhes de rede inválidos.");
      }
      setSelectedNetwork(payload.network);
      setFormOpen(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível abrir os detalhes."
      );
    }
  }

  function startEdit(network: Network) {
    setSelectedNetwork(network);
    setForm({
      name: network.name,
      description: network.description ?? "",
      supervisorIds: network.supervisors.map((supervisor) => supervisor.id),
      isActive: network.isActive,
    });
    setFormMode("edit");
    setFormOpen(true);
    setErrorMessage("");
    setSuccessMessage("");
  }

  async function saveNetwork(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const response = await fetch("/api/dashboard/networks", {
        method: formMode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          ...(formMode === "edit" && selectedNetwork
            ? { id: selectedNetwork.id }
            : {}),
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(getError(payload, "Não foi possível salvar a rede."));
      }

      const warning =
        payload &&
        typeof payload === "object" &&
        "warning" in payload &&
        typeof payload.warning === "string"
          ? payload.warning
          : "";

      if (
        !payload ||
        typeof payload !== "object" ||
        !("network" in payload) ||
        !isNetwork(payload.network)
      ) {
        throw new Error("O servidor retornou uma rede inválida.");
      }
      setSelectedNetwork(payload.network);
      setSuccessMessage(
        warning ||
          (formMode === "create"
            ? "Rede cadastrada com sucesso."
            : "Rede atualizada com sucesso.")
      );
      setFormOpen(false);
      setLoading(true);
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar a rede."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.modulePage} aria-labelledby="networks-title">
      <div className={styles.moduleHeading}>
        <div>
          <span className={styles.moduleEyebrow}>GESTÃO DA IGREJA</span>
          <h1 id="networks-title">Redes</h1>
          <p>Organize as redes e acompanhe suas células</p>
        </div>
        {data?.canManage && (
          <button
            type="button"
            className={styles.modulePrimaryButton}
            onClick={startCreate}
          >
            Cadastrar rede
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

      <div className={styles.networkStats}>
        {[
          ["Total de redes", data?.stats.total ?? "—"],
          ["Redes ativas", data?.stats.active ?? "—"],
          ["Total de células", data?.stats.cells ?? "—"],
        ].map(([label, value]) => (
          <article className={styles.moduleStat} key={label}>
            <span>{label}</span>
            <strong>{loading ? "…" : value}</strong>
          </article>
        ))}
      </div>

      {formOpen && (
        <form className={styles.moduleForm} onSubmit={saveNetwork}>
          <div className={styles.moduleFormHeading}>
            <div>
              <span className={styles.moduleEyebrow}>
                {formMode === "create" ? "NOVO CADASTRO" : "ATUALIZAÇÃO"}
              </span>
              <h2>
                {formMode === "create" ? "Cadastrar rede" : "Editar rede"}
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
              <span>Nome da rede *</span>
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

            <label className={styles.moduleField}>
              <span>Supervisor(es) responsável(is)</span>
              <select
                multiple
                size={Math.min(Math.max(data?.supervisors.length ?? 1, 2), 5)}
                value={form.supervisorIds}
                onChange={(event) =>
                  setForm({
                    ...form,
                    supervisorIds: Array.from(
                      event.currentTarget.selectedOptions,
                      (option) => option.value
                    ),
                  })
                }
              >
                {(data?.supervisors ?? []).map((supervisor) => (
                  <option key={supervisor.id} value={supervisor.id}>
                    {supervisor.fullName}
                  </option>
                ))}
              </select>
              <small>Use Ctrl (Windows) ou Command (Mac) para selecionar mais de um.</small>
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
          </div>
          <p className={styles.moduleNote}>
            O schema atual não possui campo de observações separado.
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
              {saving
                ? "Salvando..."
                : formMode === "create"
                  ? "Cadastrar rede"
                  : "Salvar alterações"}
            </button>
          </div>
        </form>
      )}

      {selectedNetwork && !formOpen && (
        <section className={styles.networkDetails} aria-labelledby="network-details-title">
          <div className={styles.moduleFormHeading}>
            <div>
              <span className={styles.moduleEyebrow}>DETALHES DA REDE</span>
              <h2 id="network-details-title">{selectedNetwork.name}</h2>
            </div>
            <div className={styles.moduleRowActions}>
              {data?.canManage && (
                <button
                  type="button"
                  className={styles.moduleSecondaryButton}
                  onClick={() => startEdit(selectedNetwork)}
                >
                  Editar
                </button>
              )}
              <button
                type="button"
                className={styles.moduleSecondaryButton}
                onClick={() => setSelectedNetwork(null)}
              >
                Fechar
              </button>
            </div>
          </div>
          <div className={styles.networkDetailStats}>
            <div>
              <span>Situação</span>
              <strong>{selectedNetwork.isActive ? "Ativa" : "Inativa"}</strong>
            </div>
            <div>
              <span>Células</span>
              <strong>{selectedNetwork.cellCount}</strong>
            </div>
            <div>
              <span>Membros</span>
              <strong>{selectedNetwork.memberCount}</strong>
            </div>
            <div>
              <span>Criada em</span>
              <strong>{displayDate(selectedNetwork.createdAt)}</strong>
            </div>
          </div>
          <div className={styles.networkDetailsGrid}>
            <div>
              <h3>Supervisores responsáveis</h3>
              {selectedNetwork.supervisors.length ? (
                <ul className={styles.networkPeopleList}>
                  {selectedNetwork.supervisors.map((supervisor) => (
                    <li key={supervisor.id}>
                      <strong>{supervisor.fullName}</strong>
                      <span>{supervisor.email || "E-mail não informado"}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.moduleNote}>Nenhum supervisor vinculado.</p>
              )}
            </div>
            <div>
              <h3>Células vinculadas</h3>
              {selectedNetwork.cells.length ? (
                <ul className={styles.networkPeopleList}>
                  {selectedNetwork.cells.map((cell) => (
                    <li key={cell.id}>
                      <strong>{cell.name}</strong>
                      <span>
                        Líder: {cell.leaderName || "Não informado"} ·{" "}
                        {cell.memberCount} membro(s) ·{" "}
                        {cell.isActive ? "Ativa" : "Inativa"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.moduleNote}>
                  Nenhuma célula vinculada a esta rede.
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      <div className={styles.networkFilters}>
        <label className={styles.moduleSearch}>
          <span className={styles.moduleSrOnly}>Pesquisar redes</span>
          <input
            type="search"
            placeholder="Buscar por nome da rede"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className={styles.filterField}>
          <span className={styles.moduleSrOnly}>Filtrar situação</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">Todas as situações</option>
            <option value="active">Ativas</option>
            <option value="inactive">Inativas</option>
          </select>
        </label>
      </div>

      <div className={styles.moduleTableCard}>
        {loading ? (
          <p className={styles.moduleEmpty}>Carregando redes...</p>
        ) : errorMessage && !data ? (
          <p className={styles.moduleEmpty}>Não foi possível exibir as redes.</p>
        ) : filteredNetworks.length === 0 ? (
          <p className={styles.moduleEmpty}>
            {data?.networks.length
              ? "Nenhuma rede corresponde à pesquisa."
              : "Nenhuma rede cadastrada nesta área."}
          </p>
        ) : (
          <div className={styles.moduleTableScroll}>
            <table className={styles.moduleTable}>
              <thead>
                <tr>
                  <th>Nome da rede</th>
                  <th>Supervisor responsável</th>
                  <th>Células</th>
                  <th>Membros</th>
                  <th>Criação</th>
                  <th>Situação</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredNetworks.map((network) => (
                  <tr key={network.id}>
                    <td data-label="Rede">
                      <strong className={styles.moduleName}>
                        {network.name}
                      </strong>
                      <small className={styles.moduleSubtext}>
                        {network.description || "Sem descrição"}
                      </small>
                    </td>
                    <td data-label="Supervisor">
                      {network.supervisors.length
                        ? network.supervisors
                            .map((supervisor) => supervisor.fullName)
                            .join(", ")
                        : "Não vinculado"}
                    </td>
                    <td data-label="Células">{network.cellCount}</td>
                    <td data-label="Membros">{network.memberCount}</td>
                    <td data-label="Criação">{displayDate(network.createdAt)}</td>
                    <td data-label="Situação">
                      <span
                        className={`${styles.moduleBadge} ${
                          network.isActive
                            ? styles.moduleBadgeActive
                            : styles.moduleBadgeInactive
                        }`}
                      >
                        {network.isActive ? "Ativa" : "Inativa"}
                      </span>
                    </td>
                    <td data-label="Ações">
                      <div className={styles.moduleRowActions}>
                        <button
                          type="button"
                          className={styles.moduleTextButton}
                          onClick={() => void openDetails(network)}
                        >
                          Detalhes
                        </button>
                        {data?.canManage && (
                          <button
                            type="button"
                            className={styles.moduleTextButton}
                            onClick={() => startEdit(network)}
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
