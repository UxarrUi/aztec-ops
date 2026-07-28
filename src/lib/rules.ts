import { EXTERNAL_BLOCKER_PATTERNS, RISK } from "./config";
import { deriveNextStep, findCycles, isTaskOpen, isTaskOverdue } from "./graph";
import type {
  BlockerKind,
  BlockerLike,
  Flag,
  HealthLabel,
  ProjectLike,
  TaskLike,
} from "./types";

/**
 * Las reglas de detección que pide el enunciado: proyectos en riesgo, bloqueados
 * y sin siguiente paso claro. Más cuatro que el dataset hizo evidentes y que no
 * estaban pedidas, pero sin las cuales el tablero miente.
 */

export interface RuleContext {
  asOf: Date;
  /** Alias de las personas por encima del umbral de carga. */
  overloadedOwners: Set<string>;
  /** Código de proyecto → códigos de sus posibles duplicados. */
  duplicates: Map<string, string[]>;
  /** Alias que sí existen en la tabla de equipo. */
  knownMembers: Set<string>;
}

/**
 * Un bloqueo es externo si su texto nombra a un tercero o a un trámite suyo:
 * cliente, proveedor, accesos, aprobaciones.
 *
 * Es una heurística sobre palabras, no una verdad: acierta con los textos del
 * dataset y con lo que la gente suele escribir, pero puede equivocarse con una
 * redacción libre. Por eso el formulario deja elegir el tipo a mano — la
 * detección es una propuesta, no una decisión. Y es deliberado que sea
 * determinista y no un modelo: de esta clasificación depende a qué cola va el
 * proyecto, y eso tiene que ser reproducible.
 */
export function classifyBlockerText(text: string): BlockerKind {
  // Sin acentos, para que "aprobación" y "aprobacion" se traten igual.
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

  return EXTERNAL_BLOCKER_PATTERNS.some((p) => normalized.includes(p))
    ? "EXTERNO"
    : "INTERNO";
}

export function isBlockerOpen(blocker: BlockerLike): boolean {
  return blocker.resolvedAt === null;
}

export function openExternalBlockers(project: ProjectLike): BlockerLike[] {
  return project.blockers.filter((b) => isBlockerOpen(b) && b.kind === "EXTERNO");
}

export function openTasks(project: ProjectLike): TaskLike[] {
  return project.tasks.filter(isTaskOpen);
}

export function blockedTasks(project: ProjectLike): TaskLike[] {
  return project.tasks.filter((t) => t.status === "Bloqueada");
}

export function overdueTasks(project: ProjectLike, asOf: Date): TaskLike[] {
  return project.tasks.filter((t) => isTaskOverdue(t, asOf));
}

/**
 * Salud recalculada.
 *
 * No se usa el campo `health` del dataset porque miente: los cuatro proyectos de
 * Diagnóstico (PRJ-13 a PRJ-16) venían marcados "En riesgo" teniendo tareas
 * Bloqueadas. Aquí la salud se deduce de lo que de verdad pasa con las tareas.
 */
export function computeHealth(
  project: ProjectLike,
  ctx: Pick<RuleContext, "asOf" | "overloadedOwners">,
): HealthLabel {
  const hasBlockedTask = blockedTasks(project).length > 0;
  const hasOpenBlocker = project.blockers.some(isBlockerOpen);
  if (hasBlockedTask || hasOpenBlocker || project.healthSource === "Bloqueado") {
    return "Bloqueado";
  }

  const targetPassed =
    project.targetDate !== null && project.targetDate.getTime() < ctx.asOf.getTime();
  const hasOverdue = overdueTasks(project, ctx.asOf).length > 0;
  const ownerOverloaded =
    project.ownerAlias !== null && ctx.overloadedOwners.has(project.ownerAlias);

  if (targetPassed || hasOverdue || ownerOverloaded || project.healthSource === "En riesgo") {
    return "En riesgo";
  }

  return "Sano";
}

export function healthValue(health: HealthLabel): number {
  return RISK.healthValue[health];
}

/** Normaliza el nombre para comparar duplicados: sin "(Fase N)", sin mayúsculas. */
export function normalizeProjectName(name: string): string {
  return name
    .replace(/\s*\(\s*fase\s+\w+\s*\)\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Agrupa proyectos que parecen el mismo trabajo contado dos veces.
 * En el dataset: PRJ-08 y PRJ-22, mismo cliente y mismo nombre, 73.000 USD.
 */
export function findDuplicates(projects: ProjectLike[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();

  for (const p of projects) {
    const key = `${p.clientAlias.trim().toLowerCase()}::${normalizeProjectName(p.name)}`;
    groups.set(key, [...(groups.get(key) ?? []), p.code]);
  }

  const result = new Map<string, string[]>();
  for (const codes of groups.values()) {
    if (codes.length < 2) continue;
    for (const code of codes) {
      result.set(
        code,
        codes.filter((c) => c !== code),
      );
    }
  }
  return result;
}

export function computeFlags(project: ProjectLike, ctx: RuleContext): Flag[] {
  const flags: Flag[] = [];

  const open = openTasks(project);
  const blocked = blockedTasks(project);
  const overdue = overdueTasks(project, ctx.asOf);
  const externalBlockers = openExternalBlockers(project);
  const cycles = findCycles(project.tasks);
  const health = computeHealth(project, ctx);
  const isActive = project.status === "Activo";
  const targetPassed =
    project.targetDate !== null && project.targetDate.getTime() < ctx.asOf.getTime();

  if (health === "Bloqueado") {
    const causes: string[] = [];
    if (blocked.length > 0) causes.push(`${blocked.length} tarea(s) Bloqueada(s)`);
    if (externalBlockers.length > 0) {
      causes.push(`${externalBlockers.length} bloqueo(s) externo(s) sin resolver`);
    }
    if (causes.length === 0) causes.push("marcado como bloqueado en la fuente");
    flags.push({
      code: "BLOQUEADO",
      detail: causes.join(" · "),
      severity: "alta",
    });
  }

  if (health === "En riesgo") {
    const causes: string[] = [];
    if (targetPassed) causes.push("fecha límite vencida");
    if (overdue.length > 0) causes.push(`${overdue.length} tarea(s) vencida(s)`);
    if (project.ownerAlias && ctx.overloadedOwners.has(project.ownerAlias)) {
      causes.push(`responsable sobrecargado (${project.ownerAlias})`);
    }
    if (causes.length === 0) causes.push("marcado en riesgo en la fuente");
    flags.push({ code: "EN_RIESGO", detail: causes.join(" · "), severity: "alta" });
  }

  if (deriveNextStep(project) === null) {
    const detail =
      open.length === 0
        ? "no hay tareas abiertas de las que derivar un siguiente paso"
        : "todas las tareas abiertas están bloqueadas o esperando una dependencia";
    flags.push({ code: "SIN_SIGUIENTE_PASO", detail, severity: "alta" });
  }

  if (cycles.length > 0) {
    flags.push({
      code: "DEPENDENCIA_CIRCULAR",
      detail: cycles
        .map((c) => `${c.join(" → ")} → ${c[0]} (no pueden arrancar nunca)`)
        .join(" · "),
      severity: "alta",
    });
  }

  if (isActive && open.length === 0 && targetPassed) {
    flags.push({
      code: "PROYECTO_ZOMBIE",
      detail: "activo, sin tareas abiertas y con la fecha límite vencida",
      severity: "alta",
    });
  }

  const duplicates = ctx.duplicates.get(project.code);
  if (duplicates && duplicates.length > 0) {
    flags.push({
      code: "DUPLICADO_PROBABLE",
      detail: `mismo cliente y nombre que ${duplicates.join(", ")}`,
      severity: "media",
    });
  }

  const missing: string[] = [];
  if (!project.targetDate) missing.push("fecha límite");
  if (project.businessValueUsd === null) missing.push("valor de negocio");
  if (!project.startDate) missing.push("fecha de inicio");
  if (missing.length > 0) {
    flags.push({
      code: "DATOS_INCOMPLETOS",
      detail: `falta ${missing.join(", ")}`,
      severity: missing.includes("fecha límite") ? "media" : "baja",
    });
  }

  if (project.ownerAlias && ctx.overloadedOwners.has(project.ownerAlias)) {
    flags.push({
      code: "SOBRECARGA_OWNER",
      detail: `${project.ownerAlias} está por encima del umbral de carga del equipo`,
      severity: "media",
    });
  }

  if (project.ownerAlias && !ctx.knownMembers.has(project.ownerAlias)) {
    flags.push({
      code: "PERSONA_FANTASMA",
      detail: `${project.ownerAlias} no aparece en la tabla de equipo`,
      severity: "media",
    });
  }

  return flags;
}

export function classifyBlockersFromTasks(project: ProjectLike): BlockerLike[] {
  return blockedTasks(project).map((t) => ({
    kind: classifyBlockerText(`${t.title} ${t.detail ?? ""}`),
    description: t.detail ?? t.title,
    sourceTaskCode: t.code,
    ownerAlias: t.assigneeAlias,
    dueBy: t.dueDate,
    resolvedAt: null,
  }));
}
