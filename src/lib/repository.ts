import { prisma } from "./db";
import { analyzePortfolio } from "./portfolio";
import type {
  BlockerKind,
  PortfolioAnalysis,
  ProjectLike,
  TaskLike,
  TaskPriority,
  TaskStatus,
  TeamMemberLike,
} from "./types";

/**
 * La frontera entre la base de datos y el dominio.
 *
 * Es el único sitio donde se toca Prisma en la ruta de lectura: traduce filas a
 * las formas planas de `types.ts` y deja que `analyzePortfolio` haga el resto.
 * Gracias a eso el motor de criterio no sabe que existe una base de datos.
 */

const projectInclude = {
  owner: { select: { alias: true } },
  nextStepOwner: { select: { alias: true } },
  tasks: {
    include: {
      assignee: { select: { alias: true } },
      dependsOn: { select: { code: true } },
    },
    orderBy: { code: "asc" },
  },
  blockers: {
    include: { owner: { select: { alias: true } } },
    orderBy: { raisedAt: "asc" },
  },
} as const;

type ProjectRow = Awaited<
  ReturnType<typeof prisma.project.findFirstOrThrow<{ include: typeof projectInclude }>>
>;

export function toProjectLike(row: ProjectRow): ProjectLike {
  return {
    code: row.code,
    name: row.name,
    clientAlias: row.clientAlias,
    engagementType: row.engagementType,
    projectTypeApi: row.projectTypeApi,
    stage: row.stage,
    status: row.status,
    healthSource: row.healthSource,
    ownerAlias: row.owner?.alias ?? null,
    startDate: row.startDate,
    targetDate: row.targetDate,
    businessValueUsd: row.businessValueUsd,
    nextStep: row.nextStep,
    nextStepOwnerAlias: row.nextStepOwner?.alias ?? null,
    nextStepDueDate: row.nextStepDueDate,
    priorityOverride: (row.priorityOverride as TaskPriority | null) ?? null,
    overrideReason: row.overrideReason,
    tasks: row.tasks.map(
      (t): TaskLike => ({
        code: t.code,
        title: t.title,
        detail: t.detail,
        assigneeAlias: t.assignee?.alias ?? null,
        priority: t.priority as TaskPriority,
        status: t.status as TaskStatus,
        dueDate: t.dueDate,
        dependsOnCode: t.dependsOn?.code ?? null,
      }),
    ),
    blockers: row.blockers.map((b) => ({
      kind: b.kind as BlockerKind,
      description: b.description,
      ownerAlias: b.owner?.alias ?? null,
      dueBy: b.dueBy,
      resolvedAt: b.resolvedAt,
    })),
  };
}

export async function getTeam(): Promise<TeamMemberLike[]> {
  const rows = await prisma.teamMember.findMany({ orderBy: { alias: "asc" } });
  return rows.map((r) => ({
    alias: r.alias,
    role: r.role,
    inSourceTeamSheet: r.inSourceTeamSheet,
  }));
}

export async function getPortfolio(asOf: Date): Promise<PortfolioAnalysis> {
  const [rows, team] = await Promise.all([
    prisma.project.findMany({
      where: { archivedAt: null },
      include: projectInclude,
      orderBy: { code: "asc" },
    }),
    getTeam(),
  ]);

  return analyzePortfolio(rows.map(toProjectLike), team, asOf);
}

/** Ficha completa de un proyecto: el análisis más lo que solo vive en la BD. */
export async function getProjectDetail(code: string, asOf: Date) {
  const row = await prisma.project.findUnique({
    where: { code },
    include: projectInclude,
  });
  if (!row) return null;

  // El análisis se hace sobre el portafolio entero a propósito: el percentil de
  // valor y el umbral de sobrecarga son posiciones relativas. Un proyecto
  // analizado en solitario tendría un score distinto y engañoso.
  const portfolio = await getPortfolio(asOf);
  const analyzed = portfolio.projects.find((p) => p.project.code === code);
  if (!analyzed) return null;

  const [notes, activity] = await Promise.all([
    prisma.note.findMany({
      where: { projectId: row.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.activityLog.findMany({
      where: { projectId: row.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return {
    id: row.id,
    analyzed,
    portfolio,
    notes,
    activity,
    tasks: row.tasks,
    blockers: row.blockers,
    summary: row.summary,
    blockersSource: row.blockersSource,
    recentCompleted: row.recentCompleted,
    businessValue: row.businessValue,
    currency: row.currency,
    rank: portfolio.projects.findIndex((p) => p.project.code === code) + 1,
  };
}

export async function getProjectCodes(): Promise<string[]> {
  const rows = await prisma.project.findMany({
    select: { code: true },
    orderBy: { code: "asc" },
  });
  return rows.map((r) => r.code);
}
