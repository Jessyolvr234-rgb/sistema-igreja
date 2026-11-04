export type MemberInput = {
  fullName: string;
  email: string | null;
  phone: string | null;
  birthDate: string | null;
  maritalStatus: string | null;
  cellId: string | null;
  isActive: boolean;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function parseMemberInput(value: unknown): MemberInput | string {
  if (!isRecord(value)) {
    return "Os dados enviados são inválidos.";
  }

  const fullName =
    typeof value.fullName === "string" ? value.fullName.trim() : "";
  const email =
    typeof value.email === "string" && value.email.trim()
      ? value.email.trim().toLowerCase()
      : null;
  const phone =
    typeof value.phone === "string" && value.phone.trim()
      ? value.phone.trim()
      : null;
  const birthDate =
    typeof value.birthDate === "string" && value.birthDate
      ? value.birthDate
      : null;
  const maritalStatus =
    typeof value.maritalStatus === "string" && value.maritalStatus.trim()
      ? value.maritalStatus.trim()
      : null;
  const cellId =
    typeof value.cellId === "string" && value.cellId.trim()
      ? value.cellId.trim()
      : null;
  const isActive = value.isActive === undefined ? true : value.isActive;

  if (!fullName || fullName.length > 150) {
    return "Informe o nome completo (até 150 caracteres).";
  }

  if (
    email &&
    (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
  ) {
    return "Informe um e-mail válido.";
  }

  if (phone && phone.length > 40) {
    return "O telefone deve ter até 40 caracteres.";
  }

  if (birthDate) {
    const parsedDate = new Date(`${birthDate}T00:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(birthDate) ||
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== birthDate
    ) {
      return "Informe uma data de nascimento válida.";
    }
  }

  if (maritalStatus && maritalStatus.length > 50) {
    return "O estado civil deve ter até 50 caracteres.";
  }

  if (typeof isActive !== "boolean") {
    return "A situação do membro é inválida.";
  }

  return {
    fullName,
    email,
    phone,
    birthDate,
    maritalStatus,
    cellId,
    isActive,
  };
}
