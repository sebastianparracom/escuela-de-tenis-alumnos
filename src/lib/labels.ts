export const STATUS_LABEL: Record<string, string> = {
  agendada: "Agendada",
  dictada: "Dictada",
  cancelada: "Cancelada",
  usado: "Usado",
  no_usado: "No usado",
  cancelada_cliente: "Cancelada antes de la hora",
};

export const STATUS_TONE: Record<string, "green" | "blue" | "amber" | "red" | "gray"> = {
  agendada: "blue",
  dictada: "green",
  usado: "green",
  cancelada: "red",
  no_usado: "red",
  cancelada_cliente: "gray",
};

export const KIND_LABEL: Record<string, string> = { individual: "Individual", grupal: "Grupal", alquiler: "Alquiler" };
export const KIND_TONE: Record<string, "green" | "blue" | "amber"> = { individual: "green", grupal: "blue", alquiler: "amber" };

export const METHOD_LABEL: Record<string, string> = { efectivo: "Efectivo", transferencia: "Transferencia" };

export const LOOSE_LABEL: Record<string, string> = {
  individual_diurna: "Clases individuales diurnas",
  individual_nocturna: "Clases individuales nocturnas",
  grupal: "Clases grupales",
};
