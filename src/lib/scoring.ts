import { RISK, URGENCY, WEIGHTS } from "./config";
import { computeHealth, overdueTasks, openTasks, healthValue } from "./rules";
import type { RuleContext } from "./rules";
import type {
  HealthLabel,
  ProjectLike,
  ScoreBreakdown,
  ScoreFactor,
  TaskPriority,
} from "./types";

/**
 * El score de atención: 0 a 100.
 *
 *     Score = 40 × Urgencia + 35 × Riesgo + 25 × Valor
 *
 * Cada factor devuelve además su explicación en texto, porque un número sin
 * justificación no sirve para discutir prioridades con un equipo. La ficha de
 * cada proyecto muestra este desglose.
 */

const DAY_MS = 86_400_000;

export function daysUntil(target: Date, asOf: Date): number {
  return Math.round((target.getTime() - asOf.getTime()) / DAY_MS);
}

export function urgencyFactor(project: ProjectLike, asOf: Date): ScoreFactor {
  const weight = WEIGHTS.urgency;

  if (!project.targetDate) {
    return {
      value: URGENCY.missing,
      weight,
      points: URGENCY.missing * weight,
      explanation:
        "sin fecha límite — se asume urgencia media para no premiar ni castigar el dato faltante",
    };
  }

  const days = daysUntil(project.targetDate, asOf);

  if (days < 0) {
    return {
      value: URGENCY.overdue,
      weight,
      points: URGENCY.overdue * weight,
      explanation: `fecha límite vencida hace ${Math.abs(days)} día(s)`,
    };
  }

  const [value, label] =
    days <= 7
      ? [URGENCY.within7, `vence en ${days} día(s)`]
      : days <= 14
        ? [URGENCY.within14, `vence en ${days} días`]
        : days <= 30
          ? [URGENCY.within30, `vence en ${days} días`]
          : days <= 60
            ? [URGENCY.within60, `vence en ${days} días`]
            : [URGENCY.beyond60, `vence en ${days} días`];

  return { value, weight, points: value * weight, explanation: label };
}

export function riskFactor(
  project: ProjectLike,
  ctx: Pick<RuleContext, "asOf" | "overloadedOwners">,
  health: HealthLabel,
): ScoreFactor {
  const weight = WEIGHTS.risk;
  const open = openTasks(project);
  const overdue = overdueTasks(project, ctx.asOf);

  const overdueRatio = open.length > 0 ? overdue.length / open.length : 0;
  const hasCriticalOverdue = overdue.some((t) => t.priority === "Critica");

  const value =
    RISK.healthWeight * healthValue(health) +
    RISK.overdueRatioWeight * overdueRatio +
    RISK.criticalOverdueWeight * (hasCriticalOverdue ? 1 : 0);

  const parts = [`salud ${health.toLowerCase()}`];
  if (open.length > 0) {
    parts.push(`${overdue.length} de ${open.length} tareas vencidas`);
  }
  if (hasCriticalOverdue) parts.push("hay una tarea crítica vencida");

  return {
    value,
    weight,
    points: value * weight,
    explanation: parts.join(" · "),
  };
}

/**
 * Escala de valor del portafolio.
 *
 * La normalización es por percentil y no lineal a propósito: el portafolio va de
 * 1.000 USD a ~38.000 USD, y hay dos proyectos en COP que al convertirlos quedan
 * arriba. Con escala lineal, los proyectos grandes aplastarían a todos los demás
 * y el ranking terminaría siendo el ranking de facturación. El percentil mide
 * posición relativa, que es lo que importa para decidir dónde mirar.
 */
export class ValueScale {
  private readonly sorted: number[];
  private readonly median: number;

  constructor(projects: ProjectLike[]) {
    this.sorted = projects
      .map((p) => p.businessValueUsd)
      .filter((v): v is number => v !== null && Number.isFinite(v))
      .sort((a, b) => a - b);

    this.median =
      this.sorted.length === 0 ? 0 : this.sorted[Math.floor(this.sorted.length / 2)];
  }

  /** Fracción del portafolio que vale estrictamente menos que `value`. */
  percentile(value: number): number {
    if (this.sorted.length <= 1) return 0.5;
    const below = this.sorted.filter((v) => v < value).length;
    return below / (this.sorted.length - 1);
  }

  medianValue(): number {
    return this.median;
  }
}

export function valueFactor(project: ProjectLike, scale: ValueScale): ScoreFactor {
  const weight = WEIGHTS.value;

  if (project.businessValueUsd === null) {
    const value = scale.percentile(scale.medianValue());
    return {
      value,
      weight,
      points: value * weight,
      explanation:
        "sin valor de negocio registrado — se usa la mediana del portafolio y se marca el dato faltante",
    };
  }

  const value = scale.percentile(project.businessValueUsd);
  const usd = Math.round(project.businessValueUsd).toLocaleString("es-CO");
  return {
    value,
    weight,
    points: value * weight,
    explanation: `${usd} USD — percentil ${Math.round(value * 100)} del portafolio`,
  };
}

export function computeScore(
  project: ProjectLike,
  ctx: Pick<RuleContext, "asOf" | "overloadedOwners">,
  scale: ValueScale,
  health: HealthLabel = computeHealth(project, ctx),
): ScoreBreakdown {
  const urgency = urgencyFactor(project, ctx.asOf);
  const risk = riskFactor(project, ctx, health);
  const value = valueFactor(project, scale);

  const total = urgency.points + risk.points + value.points;

  return { urgency, risk, value, total: Math.round(total * 10) / 10 };
}

/**
 * Banda de prioridad a partir del score. Sirve para hablar en el idioma del
 * equipo ("esto es crítico") sin perder el número que hay detrás.
 */
export function priorityBand(score: number): TaskPriority {
  if (score >= 80) return "Critica";
  if (score >= 60) return "Alta";
  if (score >= 35) return "Media";
  return "Baja";
}

/**
 * Prioridad efectiva: el override manual manda, pero solo existe acompañado de
 * una razón escrita (lo valida la capa de escritura). Si no hay override, la
 * banda del score.
 */
export function effectivePriority(
  project: ProjectLike,
  score: number,
): { priority: TaskPriority; overridden: boolean } {
  if (project.priorityOverride) {
    return { priority: project.priorityOverride, overridden: true };
  }
  return { priority: priorityBand(score), overridden: false };
}
