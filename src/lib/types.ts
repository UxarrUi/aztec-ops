/**
 * Tipos del dominio.
 *
 * A propósito NO importan nada de Prisma ni de React: son formas planas. Eso
 * permite testear todo el criterio con objetos literales, y permitiría alimentar
 * el motor desde otra fuente (un CSV, una API, un bot de Slack) sin tocar una
 * línea de la lógica.
 */

export type TaskPriority = "Critica" | "Alta" | "Media" | "Baja";

export type TaskStatus =
  | "Por hacer"
  | "En progreso"
  | "En revision"
  | "Bloqueada"
  | "Hecha";

export type HealthLabel = "Bloqueado" | "En riesgo" | "Sano";

export type EngagementType = "Proyecto" | "Mantenimiento o recurrente" | "Diagnostico";

export type ProjectStatus = "Activo" | "Pausado" | "Cerrado";

export type BlockerKind = "EXTERNO" | "INTERNO";

export type QueueName = "EJECUTAR" | "ESCALAR" | "DECIDIR";

export type FlagCode =
  | "BLOQUEADO"
  | "EN_RIESGO"
  | "SIN_SIGUIENTE_PASO"
  | "DEPENDENCIA_CIRCULAR"
  | "PROYECTO_ZOMBIE"
  | "DUPLICADO_PROBABLE"
  | "DATOS_INCOMPLETOS"
  | "SOBRECARGA_OWNER"
  | "PERSONA_FANTASMA";

export interface TaskLike {
  code: string;
  title: string;
  detail: string | null;
  assigneeAlias: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: Date | null;
  /** Código de la tarea de la que depende. El seed normaliza el texto original. */
  dependsOnCode: string | null;
}

export interface BlockerLike {
  kind: BlockerKind;
  description: string;
  /** Tarea que originó el bloqueo, cuando viene de una. */
  sourceTaskCode: string | null;
  ownerAlias: string | null;
  dueBy: Date | null;
  resolvedAt: Date | null;
}

export interface ProjectLike {
  code: string;
  name: string;
  clientAlias: string;
  engagementType: string;
  projectTypeApi: string;
  stage: string;
  status: string;
  /** Salud declarada en la fuente. Solo para auditar: el motor la recalcula. */
  healthSource: string;
  ownerAlias: string | null;
  startDate: Date | null;
  targetDate: Date | null;
  businessValueUsd: number | null;
  nextStep: string | null;
  nextStepOwnerAlias: string | null;
  nextStepDueDate: Date | null;
  priorityOverride: TaskPriority | null;
  overrideReason: string | null;
  tasks: TaskLike[];
  blockers: BlockerLike[];
}

export interface TeamMemberLike {
  alias: string;
  role: string;
  /** false cuando la persona no venía en la pestaña `Team` del dataset. */
  inSourceTeamSheet: boolean;
}

/** Un factor del score, con su explicación en texto para mostrar en la ficha. */
export interface ScoreFactor {
  /** Valor normalizado 0–1. */
  value: number;
  /** Peso del factor. */
  weight: number;
  /** Puntos que aporta al score final (value × weight). */
  points: number;
  /** Por qué dio ese valor, en lenguaje humano. */
  explanation: string;
}

export interface ScoreBreakdown {
  urgency: ScoreFactor;
  risk: ScoreFactor;
  value: ScoreFactor;
  total: number;
}

export interface Flag {
  code: FlagCode;
  /** Texto que explica el flag para este proyecto en concreto. */
  detail: string;
  severity: "alta" | "media" | "baja";
}

export interface NextStepSuggestion {
  /** Texto del siguiente paso. */
  text: string;
  /** De dónde salió: escrito a mano o derivado del grafo de tareas. */
  source: "manual" | "derivado";
  /** Código de la tarea que lo origina, si es derivado. */
  taskCode: string | null;
  ownerAlias: string | null;
  dueDate: Date | null;
}

export interface AnalyzedProject {
  project: ProjectLike;
  /** Salud recalculada desde las tareas. */
  health: HealthLabel;
  score: number;
  breakdown: ScoreBreakdown;
  queue: QueueName;
  /** Por qué cayó en esa cola. */
  queueReason: string;
  flags: Flag[];
  nextStep: NextStepSuggestion | null;
  /** Tareas abiertas que ya se pueden arrancar. */
  startableTasks: TaskLike[];
  openTasks: TaskLike[];
  overdueTasks: TaskLike[];
  blockedTasks: TaskLike[];
  /** Ciclos de dependencia detectados, como listas de códigos de tarea. */
  cycles: string[][];
  /** Bloqueos externos sin resolver. */
  externalBlockers: BlockerLike[];
  /** Prioridad efectiva: el override manual si existe, si no la banda del score. */
  effectivePriority: TaskPriority;
  priorityIsOverridden: boolean;
}

export interface MemberLoad {
  alias: string;
  role: string;
  inSourceTeamSheet: boolean;
  projects: number;
  openTasks: number;
  blockedTasks: number;
  highOrCriticalTasks: number;
  overdueTasks: number;
  isOverloaded: boolean;
}

export interface PortfolioAnalysis {
  asOf: Date;
  projects: AnalyzedProject[];
  queues: Record<QueueName, AnalyzedProject[]>;
  team: MemberLoad[];
  overloadThreshold: number;
  totals: {
    projects: number;
    openTasks: number;
    overdueTasks: number;
    blockedTasks: number;
    valueUsd: number;
    blocked: number;
    atRisk: number;
    healthy: number;
    withoutNextStep: number;
  };
}
