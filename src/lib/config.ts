/**
 * Toda la parametrización del criterio vive aquí, en un solo lugar y en números
 * explícitos. Si alguien no está de acuerdo con la priorización, este es el
 * archivo que tiene que discutir — no hay constantes escondidas en la interfaz.
 */

/**
 * Fecha de corte del sistema.
 *
 * El dataset es un snapshot del ~13-jul-2026: el flag `is_overdue` que trae
 * coincide con `due_date < 2026-07-13` en 78 de 82 tareas. Con la fecha real de
 * hoy, 13 de los 22 proyectos salen vencidos y el tablero pierde toda señal.
 *
 * Por eso todo cálculo temporal se hace contra esta fecha, configurable por
 * entorno y desde la interfaz. No es una trampa para que el demo se vea bien:
 * es reconocer que un portafolio se analiza siempre "a una fecha".
 */
export const DEFAULT_AS_OF_DATE = "2026-07-13";

export function resolveAsOfDate(raw?: string | null): Date {
  const value = raw?.trim() || process.env.AS_OF_DATE?.trim() || DEFAULT_AS_OF_DATE;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return new Date(`${DEFAULT_AS_OF_DATE}T00:00:00.000Z`);
  }
  return parsed;
}

/**
 * Tasa de cambio para normalizar el valor de negocio.
 *
 * El dataset mezcla monedas: 20 proyectos en USD y 2 en COP (85.000.000 y
 * 120.000.000). Sin normalizar, cualquier ranking por valor está mal. La tasa
 * es un supuesto y se declara como tal: se puede cambiar aquí.
 */
export const COP_PER_USD = 4100;

/** Pesos del score. Suman 100 para que el resultado sea legible de 0 a 100. */
export const WEIGHTS = {
  urgency: 40,
  risk: 35,
  value: 25,
} as const;

/**
 * Urgencia por días restantes hasta la fecha límite.
 *
 * `missing` = 0.5 es deliberado: un proyecto sin fecha no se premia (no baja al
 * fondo del ranking y se olvida) ni se castiga (no sube al tope sin razón). Se
 * queda en el medio y se marca con el flag DATOS_INCOMPLETOS, que es lo que de
 * verdad hay que resolver.
 */
export const URGENCY = {
  overdue: 1.0,
  within7: 0.85,
  within14: 0.7,
  within30: 0.5,
  within60: 0.3,
  beyond60: 0.15,
  missing: 0.5,
} as const;

/**
 * Riesgo. Se calcula desde las tareas, no desde el campo `health` declarado:
 * en el dataset, los 4 proyectos de Diagnóstico decían "En riesgo" teniendo
 * tareas Bloqueadas.
 */
export const RISK = {
  healthWeight: 0.5,
  overdueRatioWeight: 0.3,
  criticalOverdueWeight: 0.2,
  healthValue: {
    Bloqueado: 1.0,
    "En riesgo": 0.6,
    Sano: 0.0,
  },
} as const;

/**
 * Percentil de carga a partir del cual se considera que una persona está
 * sobrecargada. Con las 6 personas del dataset, P80 cae en 19 tareas abiertas
 * y Camila Torres (28) queda marcada.
 */
export const OVERLOAD_PERCENTILE = 0.8;

/**
 * Clasificación de bloqueos en EXTERNO vs INTERNO.
 *
 * Esta distinción es la que enruta un proyecto a ESCALAR o a EJECUTAR, y no es
 * una opinión: sale escrita en el campo `detail` de las tareas bloqueadas del
 * dataset. Un bloqueo externo no se resuelve con horas de ingeniería.
 */
export const EXTERNAL_BLOCKER_PATTERNS = [
  "waiting on client",
  "client response",
  "credentials",
  "external api",
  "external dependenc",
  "business definition",
  "permissions",
  "repository access",
  "owner confirmation",
  "pending access",
  "vendor",
  // equivalentes en español, para proyectos creados desde la aplicación
  "espera del cliente",
  "respuesta del cliente",
  "credenciales",
  "accesos",
  "permisos",
  "dependencia externa",
  "proveedor",
] as const;

/** Estados de tarea que cuentan como cerradas. */
export const CLOSED_TASK_STATUSES = ["Hecha", "Completada", "Cerrada"] as const;

/** Orden de prioridad de tareas, de más a menos urgente. */
export const TASK_PRIORITY_RANK = {
  Critica: 0,
  Alta: 1,
  Media: 2,
  Baja: 3,
} as const;
