import { OVERLOAD_PERCENTILE } from "./config";
import { deriveNextStep, findCycles, getStartableTasks, isTaskOpen } from "./graph";
import {
  blockedTasks,
  computeFlags,
  computeHealth,
  findDuplicates,
  openExternalBlockers,
  openTasks,
  overdueTasks,
} from "./rules";
import type { RuleContext } from "./rules";
import { routeToQueue } from "./queues";
import { ValueScale, computeScore, effectivePriority } from "./scoring";
import type {
  AnalyzedProject,
  MemberLoad,
  PortfolioAnalysis,
  ProjectLike,
  QueueName,
  TeamMemberLike,
} from "./types";

/**
 * Orquesta todo el criterio sobre el portafolio completo.
 *
 * Está separado de las piezas individuales porque dos de los cálculos solo
 * tienen sentido con el portafolio entero a la vista: el percentil de valor
 * (posición relativa de un proyecto frente a los demás) y el umbral de
 * sobrecarga (posición relativa de una persona frente al equipo).
 */

/** Percentil por posición sobre una lista ya ordenada. */
export function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.floor(p * (sortedValues.length - 1));
  return sortedValues[index];
}

export function computeMemberLoads(
  projects: ProjectLike[],
  team: TeamMemberLike[],
  asOf: Date,
): { loads: MemberLoad[]; threshold: number } {
  const known = new Map(team.map((m) => [m.alias, m]));
  const stats = new Map<string, Omit<MemberLoad, "isOverloaded">>();

  const ensure = (alias: string) => {
    let entry = stats.get(alias);
    if (!entry) {
      const declared = known.get(alias);
      entry = {
        alias,
        role: declared?.role ?? "Sin rol registrado",
        // Si no estaba en la pestaña `Team`, es una persona fantasma:
        // aparece asignada pero la capacidad del equipo no la contaba.
        inSourceTeamSheet: declared?.inSourceTeamSheet ?? false,
        projects: 0,
        openTasks: 0,
        blockedTasks: 0,
        highOrCriticalTasks: 0,
        overdueTasks: 0,
      };
      stats.set(alias, entry);
    }
    return entry;
  };

  for (const member of team) ensure(member.alias);

  for (const project of projects) {
    if (project.ownerAlias) ensure(project.ownerAlias).projects += 1;

    for (const task of project.tasks) {
      if (!task.assigneeAlias || !isTaskOpen(task)) continue;
      const entry = ensure(task.assigneeAlias);
      entry.openTasks += 1;
      if (task.status === "Bloqueada") entry.blockedTasks += 1;
      if (task.priority === "Alta" || task.priority === "Critica") {
        entry.highOrCriticalTasks += 1;
      }
      if (task.dueDate && task.dueDate.getTime() < asOf.getTime()) {
        entry.overdueTasks += 1;
      }
    }
  }

  const sortedLoads = [...stats.values()]
    .map((s) => s.openTasks)
    .sort((a, b) => a - b);
  const threshold = percentile(sortedLoads, OVERLOAD_PERCENTILE);

  const loads = [...stats.values()]
    .map((s) => ({ ...s, isOverloaded: s.openTasks > threshold }))
    .sort((a, b) => b.openTasks - a.openTasks);

  return { loads, threshold };
}

export function analyzeProject(
  project: ProjectLike,
  ctx: RuleContext,
  scale: ValueScale,
): AnalyzedProject {
  const health = computeHealth(project, ctx);
  const breakdown = computeScore(project, ctx, scale, health);
  const { queue, reason } = routeToQueue(project, ctx);
  const { priority, overridden } = effectivePriority(project, breakdown.total);

  return {
    project,
    health,
    score: breakdown.total,
    breakdown,
    queue,
    queueReason: reason,
    flags: computeFlags(project, ctx),
    nextStep: deriveNextStep(project),
    startableTasks: getStartableTasks(project.tasks),
    openTasks: openTasks(project),
    overdueTasks: overdueTasks(project, ctx.asOf),
    blockedTasks: blockedTasks(project),
    cycles: findCycles(project.tasks),
    externalBlockers: openExternalBlockers(project),
    effectivePriority: priority,
    priorityIsOverridden: overridden,
  };
}

export function analyzePortfolio(
  projects: ProjectLike[],
  team: TeamMemberLike[],
  asOf: Date,
): PortfolioAnalysis {
  const { loads, threshold } = computeMemberLoads(projects, team, asOf);

  const ctx: RuleContext = {
    asOf,
    overloadedOwners: new Set(loads.filter((l) => l.isOverloaded).map((l) => l.alias)),
    duplicates: findDuplicates(projects),
    knownMembers: new Set(team.filter((m) => m.inSourceTeamSheet).map((m) => m.alias)),
  };

  const scale = new ValueScale(projects);
  const analyzed = projects
    .map((p) => analyzeProject(p, ctx, scale))
    .sort((a, b) => b.score - a.score || a.project.code.localeCompare(b.project.code));

  const queues: Record<QueueName, AnalyzedProject[]> = {
    EJECUTAR: [],
    ESCALAR: [],
    DECIDIR: [],
  };
  // Solo el trabajo activo entra a las colas: un proyecto pausado o cerrado no
  // compite por la atención del equipo esta semana.
  for (const item of analyzed) {
    if (item.project.status !== "Activo") continue;
    queues[item.queue].push(item);
  }

  const totals = {
    projects: analyzed.length,
    openTasks: analyzed.reduce((n, a) => n + a.openTasks.length, 0),
    overdueTasks: analyzed.reduce((n, a) => n + a.overdueTasks.length, 0),
    blockedTasks: analyzed.reduce((n, a) => n + a.blockedTasks.length, 0),
    valueUsd: analyzed.reduce((n, a) => n + (a.project.businessValueUsd ?? 0), 0),
    blocked: analyzed.filter((a) => a.health === "Bloqueado").length,
    atRisk: analyzed.filter((a) => a.health === "En riesgo").length,
    healthy: analyzed.filter((a) => a.health === "Sano").length,
    withoutNextStep: analyzed.filter((a) => a.nextStep === null).length,
  };

  return { asOf, projects: analyzed, queues, team: loads, overloadThreshold: threshold, totals };
}
