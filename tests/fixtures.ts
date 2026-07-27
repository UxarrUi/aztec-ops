import type { BlockerLike, ProjectLike, TaskLike, TeamMemberLike } from "@/lib/types";

/** Fecha de corte usada en los tests: la del snapshot del dataset. */
export const AS_OF = new Date("2026-07-13T00:00:00.000Z");

export function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function task(overrides: Partial<TaskLike> & { code: string }): TaskLike {
  return {
    title: `Tarea ${overrides.code}`,
    detail: null,
    assigneeAlias: "Camila Torres",
    priority: "Media",
    status: "Por hacer",
    dueDate: null,
    dependsOnCode: null,
    ...overrides,
  };
}

export function blocker(overrides: Partial<BlockerLike> = {}): BlockerLike {
  return {
    kind: "EXTERNO",
    description: "Waiting on client response",
    ownerAlias: null,
    dueBy: null,
    resolvedAt: null,
    ...overrides,
  };
}

export function project(
  overrides: Partial<ProjectLike> & { code: string },
): ProjectLike {
  return {
    name: `Proyecto ${overrides.code}`,
    clientAlias: "Cliente Demo",
    engagementType: "Proyecto",
    projectTypeApi: "Automatizacion",
    stage: "Ejecucion",
    status: "Activo",
    healthSource: "Sano",
    ownerAlias: "Camila Torres",
    startDate: null,
    targetDate: d("2026-09-30"),
    businessValueUsd: 10_000,
    nextStep: null,
    nextStepOwnerAlias: null,
    nextStepDueDate: null,
    priorityOverride: null,
    overrideReason: null,
    tasks: [],
    blockers: [],
    ...overrides,
  };
}

export function member(
  alias: string,
  overrides: Partial<TeamMemberLike> = {},
): TeamMemberLike {
  return { alias, role: "Delivery", inSourceTeamSheet: true, ...overrides };
}

/**
 * Réplica del patrón real de PRJ-04: T02 depende de T03 y T03 depende de T02.
 * T01 no depende de nada, T04 depende de T01.
 */
export function projectWithCycle(): ProjectLike {
  return project({
    code: "PRJ-04",
    name: "Quotation Engine",
    healthSource: "Bloqueado",
    targetDate: d("2026-03-05"),
    businessValueUsd: 25_000,
    tasks: [
      task({
        code: "PRJ-04-T01",
        title: "Plan next delivery iteration - Quotation Engine",
        status: "En progreso",
        priority: "Alta",
        dueDate: d("2026-07-12"),
      }),
      task({
        code: "PRJ-04-T02",
        title: "Resolve priority issue in pilot or production - Quotation Engine",
        status: "Por hacer",
        priority: "Critica",
        dueDate: d("2026-07-10"),
        dependsOnCode: "PRJ-04-T03",
      }),
      task({
        code: "PRJ-04-T03",
        title: "Align external dependency with client or vendor - Quotation Engine",
        status: "Bloqueada",
        priority: "Media",
        dueDate: d("2026-07-14"),
        dependsOnCode: "PRJ-04-T02",
        detail: "Waiting on client response, credentials, external API or business definition.",
      }),
      task({
        code: "PRJ-04-T04",
        title: "Functional validation and release checklist - Quotation Engine",
        status: "En revision",
        priority: "Alta",
        dueDate: d("2026-07-16"),
        dependsOnCode: "PRJ-04-T01",
      }),
    ],
    blockers: [
      blocker({
        kind: "EXTERNO",
        description: "Waiting on client response, credentials, external API or business definition.",
      }),
    ],
  });
}

/** Réplica de PRJ-21: activo, sin tareas y con la fecha límite vencida. */
export function zombieProject(): ProjectLike {
  return project({
    code: "PRJ-21",
    name: "Route Optimization Pilot",
    healthSource: "Sano",
    targetDate: d("2026-02-10"),
    businessValueUsd: 16_000,
    tasks: [],
  });
}

/** Proyecto sano con backlog encadenado y sin bloqueos: el caso feliz. */
export function healthyProject(): ProjectLike {
  return project({
    code: "PRJ-19",
    name: "Contract Clause Extractor",
    ownerAlias: "Andrea Molina",
    healthSource: "Sano",
    targetDate: d("2026-09-30"),
    businessValueUsd: 19_000,
    tasks: [
      task({
        code: "PRJ-19-T01",
        title: "Iteracion en curso con entregables definidos - Contract Clause Extractor",
        status: "En progreso",
        priority: "Media",
        dueDate: d("2026-08-14"),
        assigneeAlias: "Andrea Molina",
      }),
      task({
        code: "PRJ-19-T02",
        title: "Validacion funcional del modulo - Contract Clause Extractor",
        status: "Por hacer",
        priority: "Alta",
        dueDate: d("2026-08-20"),
        dependsOnCode: "PRJ-19-T01",
        assigneeAlias: "Andrea Molina",
      }),
    ],
  });
}
