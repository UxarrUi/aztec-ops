/** Formateo compartido entre el dominio y la interfaz. Sin dependencias. */

export function formatUsdPlain(value: number | null | undefined): string {
  if (value === null || value === undefined) return "sin dato";
  return `${Math.round(value).toLocaleString("es-CO")} USD`;
}

export function formatDatePlain(date: Date | null | undefined): string {
  return date ? date.toISOString().slice(0, 10) : "sin fecha";
}
