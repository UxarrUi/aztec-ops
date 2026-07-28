import Link from "next/link";
import type { ReactNode } from "react";
import type { Flag, HealthLabel, QueueName, TaskPriority } from "@/lib/types";

/**
 * Vocabulario visual del sistema.
 *
 * El color sólo se usa para significar estado, nunca para decorar: cada cola,
 * cada salud y cada prioridad tiene un color fijo, y quien mire el tablero dos
 * veces ya sabe leerlo sin buscar la leyenda.
 */

export const QUEUE_STYLES: Record<
  QueueName,
  { label: string; chip: string; accent: string; question: string; description: string }
> = {
  EJECUTAR: {
    label: "Ejecutar",
    chip: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
    accent: "text-emerald-300",
    question: "¿Qué trabaja el equipo hoy?",
    description: "Hay una tarea arrancable y ningún bloqueo externo pendiente.",
  },
  ESCALAR: {
    label: "Escalar",
    chip: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
    accent: "text-amber-300",
    question: "¿A quién hay que llamar?",
    description: "Bloqueado por un tercero. No avanza con más horas de trabajo.",
  },
  DECIDIR: {
    label: "Decidir",
    chip: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
    accent: "text-violet-300",
    question: "¿Qué hay que resolver antes de poder priorizarlo?",
    description: "Necesita una decisión humana antes de entrar al flujo.",
  },
};

const HEALTH_STYLES: Record<HealthLabel, string> = {
  Bloqueado: "bg-red-500/15 text-red-300 ring-red-500/30",
  "En riesgo": "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  Sano: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
};

const PRIORITY_STYLES: Record<TaskPriority, string> = {
  Critica: "bg-red-500/15 text-red-300 ring-red-500/30",
  Alta: "bg-orange-500/15 text-orange-300 ring-orange-500/30",
  Media: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  Baja: "bg-slate-500/15 text-slate-300 ring-slate-500/30",
};

const SEVERITY_STYLES: Record<Flag["severity"], string> = {
  alta: "bg-red-500/10 text-red-300 ring-red-500/25",
  media: "bg-amber-500/10 text-amber-300 ring-amber-500/25",
  baja: "bg-slate-500/10 text-slate-400 ring-slate-500/25",
};

export function Chip({
  children,
  className = "",
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${className}`}
    >
      {children}
    </span>
  );
}

export function QueueBadge({ queue }: { queue: QueueName }) {
  const style = QUEUE_STYLES[queue];
  return <Chip className={style.chip}>{style.label}</Chip>;
}

export function HealthBadge({ health }: { health: HealthLabel }) {
  return <Chip className={HEALTH_STYLES[health]}>{health}</Chip>;
}

export function PriorityBadge({
  priority,
  overridden,
}: {
  priority: TaskPriority;
  overridden?: boolean;
}) {
  return (
    <Chip
      className={PRIORITY_STYLES[priority]}
      title={overridden ? "Prioridad fijada a mano, con razón registrada" : undefined}
    >
      {overridden && <span aria-hidden>✋</span>}
      {priority}
    </Chip>
  );
}

const FLAG_LABELS: Record<string, string> = {
  BLOQUEADO: "Bloqueado",
  EN_RIESGO: "En riesgo",
  SIN_SIGUIENTE_PASO: "Sin siguiente paso",
  DEPENDENCIA_CIRCULAR: "Dependencia circular",
  PROYECTO_ZOMBIE: "Proyecto zombie",
  DUPLICADO_PROBABLE: "Duplicado probable",
  DATOS_INCOMPLETOS: "Datos incompletos",
  SOBRECARGA_OWNER: "Responsable sobrecargado",
  PERSONA_FANTASMA: "Persona fuera del equipo",
};

export function FlagChip({ flag }: { flag: Flag }) {
  return (
    <Chip className={SEVERITY_STYLES[flag.severity]} title={flag.detail}>
      {FLAG_LABELS[flag.code] ?? flag.code}
    </Chip>
  );
}

export function flagLabel(code: string): string {
  return FLAG_LABELS[code] ?? code;
}

export function ScoreBadge({ score }: { score: number }) {
  const tone =
    score >= 80
      ? "text-red-300"
      : score >= 60
        ? "text-orange-300"
        : score >= 35
          ? "text-sky-300"
          : "text-slate-400";
  return <span className={`tabular font-semibold ${tone}`}>{score.toFixed(1)}</span>;
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-line bg-surface ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  title,
  hint,
  right,
}: {
  title: string;
  hint?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-4 py-3">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </div>
      {right}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: string;
}) {
  return (
    <Card className="px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`tabular mt-1 text-2xl font-semibold ${tone}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted">{hint}</div>}
    </Card>
  );
}

export function ProjectLink({
  code,
  name,
  asOf,
}: {
  code: string;
  name?: string;
  asOf?: string;
}) {
  const href = asOf ? `/proyectos/${code}?asOf=${asOf}` : `/proyectos/${code}`;
  return (
    <Link href={href} className="group inline-flex items-baseline gap-2">
      <span className="tabular font-mono text-xs text-muted group-hover:text-foreground">
        {code}
      </span>
      {name && (
        <span className="font-medium underline-offset-2 group-hover:underline">{name}</span>
      )}
    </Link>
  );
}

export function formatDate(date: Date | null | undefined): string {
  if (!date) return "—";
  return date.toISOString().slice(0, 10);
}

export function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${Math.round(value).toLocaleString("es-CO")} USD`;
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}
