"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import styles from "./dashboard.module.css";

type UserRole = "supervisor" | "leader";

type User = {
  id: string;
  fullName: string;
  email: string;
  role: UserRole | "admin";
  isActive: boolean;
};

function getApiError(payload: unknown, fallback: string) {
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

function isUser(value: unknown): value is User {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (
    !("id" in value) ||
    !("fullName" in value) ||
    !("email" in value) ||
    !("role" in value) ||
    !("isActive" in value)
  ) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.fullName === "string" &&
    typeof value.email === "string" &&
    (value.role === "admin" ||
      value.role === "supervisor" ||
      value.role === "leader") &&
    typeof value.isActive === "boolean"
  );
}

function isUserList(value: unknown): value is User[] {
  return Array.isArray(value) && value.every(isUser);
}

function getRoleLabel(role: User["role"]) {
  switch (role) {
    case "admin":
      return "Administrador";
    case "supervisor":
      return "Supervisor";
    case "leader":
      return "Líder";
  }
}

export default function UsersManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("leader");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadUsers() {
      try {
        const response = await fetch("/api/admin/users", {
          signal: controller.signal,
        });
        const payload: unknown = await response.json();

        if (!response.ok) {
          throw new Error(
            getApiError(payload, "Não foi possível carregar os usuários.")
          );
        }

        if (
          !payload ||
          typeof payload !== "object" ||
          !("users" in payload) ||
          !isUserList(payload.users)
        ) {
          throw new Error("A resposta do servidor está em um formato inválido.");
        }

        setUsers(payload.users);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar os usuários."
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadUsers();

    return () => controller.abort();
  }, []);

  const filteredUsers = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");

    if (!normalizedSearch) {
      return users;
    }

    return users.filter(
      (user) =>
        user.fullName.toLocaleLowerCase("pt-BR").includes(normalizedSearch) ||
        user.email.toLocaleLowerCase("pt-BR").includes(normalizedSearch)
    );
  }, [search, users]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, password, role }),
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        throw new Error(
          getApiError(payload, "Não foi possível cadastrar o usuário.")
        );
      }

      if (
        !payload ||
        typeof payload !== "object" ||
        !("user" in payload) ||
        !isUser(payload.user)
      ) {
        throw new Error("O servidor não confirmou o cadastro do usuário.");
      }

      const createdUser = payload.user;
      setUsers((currentUsers) =>
        [...currentUsers, createdUser].sort((first, second) =>
          first.fullName.localeCompare(second.fullName, "pt-BR")
        )
      );
      setFullName("");
      setEmail("");
      setPassword("");
      setRole("leader");
      setShowForm(false);
      setSuccessMessage("Usuário cadastrado com sucesso.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível cadastrar o usuário."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.usersPage} aria-labelledby="users-title">
      <div className={styles.usersHeading}>
        <div>
          <span className={styles.usersEyebrow}>ADMINISTRAÇÃO</span>
          <h1 id="users-title">Usuários</h1>
          <p>Cadastre e consulte os acessos de supervisores e líderes.</p>
        </div>
        <button
          type="button"
          className={styles.createUserButton}
          onClick={() => {
            setShowForm((isVisible) => !isVisible);
            setErrorMessage("");
            setSuccessMessage("");
          }}
          aria-expanded={showForm}
          aria-controls={showForm ? "create-user-form" : undefined}
        >
          {showForm ? "Cancelar" : "Novo usuário"}
        </button>
      </div>

      {errorMessage && (
        <div className={styles.usersAlertError} role="alert">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className={styles.usersAlertSuccess} role="status">
          {successMessage}
        </div>
      )}

      {showForm && (
        <form
          id="create-user-form"
          className={styles.userForm}
          onSubmit={handleSubmit}
        >
          <div className={styles.userFormHeading}>
            <div>
              <h2>Cadastrar usuário</h2>
              <p>O acesso será criado imediatamente.</p>
            </div>
          </div>

          <div className={styles.userFormFields}>
            <label className={styles.userField}>
              <span>Nome completo</span>
              <input
                autoComplete="name"
                required
                maxLength={120}
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Nome do usuário"
              />
            </label>

            <label className={styles.userField}>
              <span>E-mail</span>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nome@exemplo.com"
              />
            </label>

            <label className={styles.userField}>
              <span>Senha temporária</span>
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Mínimo de 8 caracteres"
              />
            </label>

            <label className={styles.userField}>
              <span>Perfil de acesso</span>
              <select
                value={role}
                onChange={(event) => {
                  const selectedRole = event.target.value;
                  if (
                    selectedRole === "leader" ||
                    selectedRole === "supervisor"
                  ) {
                    setRole(selectedRole);
                  }
                }}
              >
                <option value="leader">Líder</option>
                <option value="supervisor">Supervisor</option>
              </select>
            </label>
          </div>

          <div className={styles.userFormFooter}>
            <p>A senha poderá ser alterada pelo usuário posteriormente.</p>
            <button
              type="submit"
              className={styles.createUserButton}
              disabled={saving}
            >
              {saving ? "Cadastrando..." : "Cadastrar usuário"}
            </button>
          </div>
        </form>
      )}

      <div className={styles.userListHeader}>
        <div>
          <h2>Usuários cadastrados</h2>
          <p>
            {users.length} {users.length === 1 ? "usuário" : "usuários"}
          </p>
        </div>
        <label className={styles.userSearch}>
          <span className={styles.srOnly}>Buscar usuários</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome ou e-mail"
          />
        </label>
      </div>

      <div className={styles.userTableCard}>
        {loading ? (
          <p className={styles.userListMessage}>Carregando usuários...</p>
        ) : errorMessage && users.length === 0 ? (
          <p className={styles.userListMessage}>
            Não foi possível exibir a lista de usuários.
          </p>
        ) : filteredUsers.length === 0 ? (
          <p className={styles.userListMessage}>
            {users.length === 0
              ? "Nenhum usuário cadastrado ainda."
              : "Nenhum usuário corresponde à busca."}
          </p>
        ) : (
          <div className={styles.userTableScroll}>
            <table className={styles.userTable}>
              <thead>
                <tr>
                  <th scope="col">Nome</th>
                  <th scope="col">E-mail</th>
                  <th scope="col">Perfil</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td data-label="Nome">
                      <span className={styles.userName}>{user.fullName}</span>
                    </td>
                    <td data-label="E-mail">{user.email}</td>
                    <td data-label="Perfil">{getRoleLabel(user.role)}</td>
                    <td data-label="Status">
                      <span
                        className={`${styles.userStatus} ${
                          user.isActive
                            ? styles.userStatusActive
                            : styles.userStatusInactive
                        }`}
                      >
                        {user.isActive ? "Ativo" : "Inativo"}
                      </span>
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
