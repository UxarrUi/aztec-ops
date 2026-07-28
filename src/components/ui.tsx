import Link from "next/link";
import type { ReactNode } from "react";
import type { Flag, HealthLabel, QueueName, TaskPriority } from "@/lib/types";

/**
 * Vocabulario visual del sistema, sobre la paleta de Aztec.
 *
 * El color sólo se usa para significar estado, nunca para decorar: cada cola,
 * cada salud y cada prioridad tiene un color fijo, y quien mire el tablero dos
 * veces ya sabe leerlo sin buscar la leyenda.
 *
 * El verde de la marca queda reservado a "va bien" (cola Ejecutar, salud Sana).
 * Lo interactivo usa el verde oscuro `--brand`, para no competir con él.
 */

export const QUEUE_STYLES: Record<
  QueueName,
  { label: string; chip: string; accent: string; bar: string; question: string }
> = {
  EJECUTAR: {
    label: "Ejecutar",
    chip: "bg-accent-soft text-accent-ink ring-accent-ring",
    accent: "text-accent-ink",
    bar: "bg-accent",
    question: "¿Qué trabaja el equipo hoy?",
  },
  ESCALAR: {
    label: "Escalar",
    chip: "bg-amber-50 text-amber-800 ring-amber-200",
    accent: "text-amber-700",
    bar: "bg-amber-500",
    question: "¿A quién hay que llamar?",
  },
  DECIDIR: {
    label: "Decidir",
    chip: "bg-violet-50 text-violet-800 ring-violet-200",
    accent: "text-violet-700",
    bar: "bg-violet-500",
    question: "¿Qué hay que resolver antes de poder priorizarlo?",
  },
};

const HEALTH_STYLES: Record<HealthLabel, string> = {
  Bloqueado: "bg-red-50 text-red-800 ring-red-200",
  "En riesgo": "bg-amber-50 text-amber-800 ring-amber-200",
  Sano: "bg-accent-soft text-accent-ink ring-accent-ring",
};

const PRIORITY_STYLES: Record<TaskPriority, string> = {
  Critica: "bg-red-50 text-red-800 ring-red-200",
  Alta: "bg-orange-50 text-orange-800 ring-orange-200",
  Media: "bg-sky-50 text-sky-800 ring-sky-200",
  Baja: "bg-slate-100 text-slate-700 ring-slate-200",
};

const SEVERITY_STYLES: Record<Flag["severity"], string> = {
  alta: "bg-red-50 text-red-700 ring-red-200",
  media: "bg-amber-50 text-amber-700 ring-amber-200",
  baja: "bg-slate-100 text-slate-600 ring-slate-200",
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
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${className}`}
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
      ? "text-red-700"
      : score >= 60
        ? "text-orange-700"
        : score >= 35
          ? "text-sky-700"
          : "text-muted";
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
    <div className={`rounded-2xl border border-line bg-surface ${className}`}>
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
    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div>
        <h2 className="text-sm font-bold">{title}</h2>
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
    <Card className="px-5 py-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={`tabular mt-1 text-2xl font-extrabold ${tone || "text-brand"}`}>
        {value}
      </div>
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
      <span className="tabular font-mono text-xs text-muted group-hover:text-brand">
        {code}
      </span>
      {name && (
        <span className="font-semibold underline-offset-2 group-hover:text-brand group-hover:underline">
          {name}
        </span>
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
