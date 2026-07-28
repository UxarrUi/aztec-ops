import { readFileSync } from "node:fs";
import path from "node:path";
import { COP_PER_USD } from "./config";
import { parseCsvToObjects } from "./csv";
import { classifyBlockerText } from "./rules";
import type {
  BlockerLike,
  ProjectLike,
  TaskLike,
  TaskPriority,
  TaskStatus,
  TeamMemberLike,
} from "./types";

/**
 * Carga el dataset original desde `data/*.csv` y lo normaliza al modelo del
 * dominio.
 *
 * Aquí es donde se limpian los problemas reales de la fuente. Cada uno está
 * comentado con el caso concreto que lo motivó, porque son decisiones, no
 * detalles: normalizar mal cambia el ranking.
 *
 * El mismo cargador lo usan el seed y los tests, así que los tests corren contra
 * los datos de verdad y no contra una copia idealizada.
 */

const DATA_DIR = path.join(process.cwd(), "data");

/**
 * El dataset trae dos formatos de fecha: ISO (`2026-03-02`) en casi todo, y
 * `dd/mm/yyyy` en el `start_date` de PRJ-17. Se aceptan ambos; cualquier otra
 * cosa se trata como fecha ausente en vez de inventar un valor.
 */
export function parseDate(raw: string | null | undefined): Date | null {
  const value = (raw ?? "").trim();
  if (!value) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) return new Date(`${value}T00:00:00.000Z`);

  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (dmy) {
    const [, day, month, year] = dmy;
    return new Date(
      `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T00:00:00.000Z`,
    );
  }

  return null;
}

/**
 * Normaliza el valor de negocio a USD.
 *
 * 20 proyectos vienen en USD y 2 en COP (85.000.000 y 120.000.000). Compararlos
 * sin convertir haría que los dos proyectos en pesos dominaran el ranking por
 * puro efecto de la unidad.
 */
export function toUsd(value: string, currency: string): number | null {
  const raw = value.trim();
  if (!raw) return null;

  const amount = Number(raw.replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(amount)) return null;

  return currency.trim().toUpperCase() === "COP" ? amount / COP_PER_USD : amount;
}

/** Quita el sufijo " - Nombre del proyecto" para poder cruzar dependencias. */
function baseTitle(title: string): string {
  const index = title.lastIndexOf(" - ");
  return (index === -1 ? title : title.slice(0, index)).trim();
}

export interface RawDataset {
  projects: ProjectLike[];
  team: TeamMemberLike[];
}

export function loadDataset(dir: string = DATA_DIR): RawDataset {
  const read = (file: string) =>
    parseCsvToObjects(readFileSync(path.join(dir, file), "utf8"));

  const projectRows = read("projects.csv");
  const taskRows = read("tasks.csv");
  const teamRows = read("team.csv");

  const declaredTeam = new Map(
    teamRows.map((r) => [r.member_alias, { role: r.role, inSourceTeamSheet: true }]),
  );

  // Personas que aparecen asignadas pero no están en la pestaña `Team`.
  // Es el caso de Andrea Molina: dueña de PRJ-19 con 4 tareas, invisible para
  // el conteo de capacidad del equipo.
  const seenAliases = new Map<string, string>();
  for (const row of projectRows) {
    if (row.owner_alias) seenAliases.set(row.owner_alias, row.owner_role || "Sin rol registrado");
  }
  for (const row of taskRows) {
    if (row.assignee_alias && !seenAliases.has(row.assignee_alias)) {
      seenAliases.set(row.assignee_alias, row.assignee_role || "Sin rol registrado");
    }
  }

  const team: TeamMemberLike[] = [...seenAliases].map(([alias, role]) => {
    const declared = declaredTeam.get(alias);
    return {
      alias,
      role: declared?.role ?? role,
      inSourceTeamSheet: declared !== undefined,
    };
  });

  const tasksByProject = new Map<string, TaskLike[]>();
  const titleIndex = new Map<string, Map<string, string>>();

  for (const row of taskRows) {
    const code = row.project_code;
    if (!titleIndex.has(code)) titleIndex.set(code, new Map());
    titleIndex.get(code)!.set(baseTitle(row.title), row.task_code);
  }

  for (const row of taskRows) {
    const projectCode = row.project_code;
    // La columna `dependency` es texto libre con el título de otra tarea del
    // mismo proyecto. Se resuelve al código real: es lo que después permite
    // detectar ciclos y calcular qué tarea se puede arrancar.
    const dependencyText = row.dependency.trim();
    const dependsOnCode = dependencyText
      ? (titleIndex.get(projectCode)?.get(dependencyText) ?? null)
      : null;

    const task: TaskLike = {
      code: row.task_code,
      title: row.title,
      detail: row.detail || null,
      assigneeAlias: row.assignee_alias || null,
      priority: (row.priority || "Media") as TaskPriority,
      status: (row.status || "Por hacer") as TaskStatus,
      dueDate: parseDate(row.due_date),
      dependsOnCode,
    };

    tasksByProject.set(projectCode, [...(tasksByProject.get(projectCode) ?? []), task]);
  }

  const projects: ProjectLike[] = projectRows.map((row) => {
    const tasks = tasksByProject.get(row.project_code) ?? [];

    // Los bloqueos se derivan de las tareas Bloqueadas, no del texto genérico
    // de la columna `blockers`, porque la tarea sí dice la causa concreta y de
    // ahí sale la clasificación EXTERNO/INTERNO que enruta las colas.
    const blockers: BlockerLike[] = tasks
      .filter((t) => t.status === "Bloqueada")
      .map((t) => ({
        kind: classifyBlockerText(`${t.title} ${t.detail ?? ""}`),
        description: t.detail ?? t.title,
        sourceTaskCode: t.code,
        ownerAlias: t.assigneeAlias,
        dueBy: t.dueDate,
        resolvedAt: null,
      }));

    return {
      code: row.project_code,
      name: row.project_name,
      clientAlias: row.client_alias,
      engagementType: row.engagement_type,
      projectTypeApi: row.project_type_api,
      stage: row.stage,
      status: row.status || "Activo",
      healthSource: row.health,
      ownerAlias: row.owner_alias || null,
      startDate: parseDate(row.start_date),
      targetDate: parseDate(row.target_date),
      businessValueUsd: toUsd(row.business_value, row.currency),
      // El dataset no trae siguiente paso ni notas: el sistema los deriva o los
      // deja para que el equipo los escriba.
      nextStep: null,
      nextStepOwnerAlias: null,
      nextStepDueDate: null,
      priorityOverride: null,
      overrideReason: null,
      tasks,
      blockers,
    };
  });

  return { projects, team };
}

/** Metadatos de la fuente que el seed guarda para poder auditar. */
export function loadSourceMetadata(dir: string = DATA_DIR) {
  const rows = parseCsvToObjects(readFileSync(path.join(dir, "projects.csv"), "utf8"));
  const taskRows = parseCsvToObjects(readFileSync(path.join(dir, "tasks.csv"), "utf8"));

  return {
    projects: new Map(
      rows.map((r) => [
        r.project_code,
        {
          businessValue: r.business_value ? Number(r.business_value) : null,
          currency: r.currency || null,
          openTasksSource: r.open_tasks ? Number(r.open_tasks) : null,
          overdueTasksSource: r.overdue_tasks ? Number(r.overdue_tasks) : null,
          blockersSource: r.blockers || null,
          summary: r.summary || null,
          recentCompleted: r.recent_completed_examples || null,
        },
      ]),
    ),
    tasks: new Map(
      taskRows.map((r) => [
        r.task_code,
        {
          isOverdueSource: r.is_overdue ? r.is_overdue.trim().toLowerCase() === "si" : null,
          lastProgress: r.last_progress || null,
        },
      ]),
    ),
  };
}
