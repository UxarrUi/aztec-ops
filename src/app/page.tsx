import Link from "next/link";
import { resolveAsOfDate } from "@/lib/config";
import { getPortfolio } from "@/lib/repository";
import type { AnalyzedProject, QueueName } from "@/lib/types";
import {
  Card,
  FlagChip,
  HealthBadge,
  ProjectLink,
  QUEUE_STYLES,
  ScoreBadge,
  SectionTitle,
  Stat,
  formatDate,
} from "@/components/ui";
import { ExecutiveSummary } from "@/components/ai";

export const dynamic = "force-dynamic";

/**
 * Torre de control.
 *
 * La decisión de diseño que manda en esta pantalla: NO es una lista ordenada de
 * 22 proyectos. Con 18 en rojo, esa lista no dice qué hacer. Son tres colas, y
 * cada una responde una pregunta distinta que resuelve una persona distinta.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string }>;
}) {
  const { asOf: asOfParam } = await searchParams;
  const asOf = resolveAsOfDate(asOfParam);
  const asOfKey = asOf.toISOString().slice(0, 10);
  const portfolio = await getPortfolio(asOf);
  const { totals, queues, team } = portfolio;

  const overloaded = team.filter((m) => m.isOverloaded);
  const ghosts = team.filter((m) => !m.inSourceTeamSheet);
  const activeTop10 = portfolio.projects
    .filter((p) => p.project.status === "Activo")
    .slice(0, 10);
  const workable = activeTop10.filter((p) => p.queue === "EJECUTAR").length;
  const maxLoad = Math.max(1, ...team.map((m) => m.openTasks));

  const anomalies = portfolio.projects.flatMap((p) =>
    p.flags
      .filter((f) =>
        [
          "DEPENDENCIA_CIRCULAR",
          "PROYECTO_ZOMBIE",
          "DUPLICADO_PROBABLE",
          "PERSONA_FANTASMA",
        ].includes(f.code),
      )
      .map((f) => ({ project: p, flag: f })),
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-lg font-semibold">Torre de control</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Priorizar no es ordenar una lista: es separar lo que se ejecuta, de lo que se
          escala, de lo que hay que decidir. Todo lo de abajo está calculado a la fecha{" "}
          <span className="tabular text-foreground">{asOfKey}</span>.
        </p>
      </header>

      {/* La cifra que resume el problema del portafolio. */}
      <Card className="border-amber-500/25 bg-amber-500/5 px-4 py-3">
        <p className="text-sm">
          De los <strong>10 proyectos más urgentes</strong>, solo{" "}
          <strong className="text-emerald-300">{workable}</strong>{" "}
          {workable === 1 ? "se puede trabajar" : "se pueden trabajar"} hoy.{" "}
          {activeTop10.filter((p) => p.queue === "ESCALAR").length} dependen de un tercero
          y {activeTop10.filter((p) => p.queue === "DECIDIR").length} necesitan una
          decisión.
        </p>
        <p className="mt-1 text-xs text-muted">
          Por eso el sistema separa por tipo de acción y no solo por urgencia: más horas de
          trabajo no mueven la mayor parte de este portafolio.
        </p>
      </Card>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Proyectos" value={totals.projects} hint={`${totals.healthy} sanos`} />
        <Stat
          label="Bloqueados"
          value={totals.blocked}
          tone="text-red-300"
          hint="salud recalculada"
        />
        <Stat label="En riesgo" value={totals.atRisk} tone="text-amber-300" />
        <Stat
          label="Tareas vencidas"
          value={totals.overdueTasks}
          tone="text-amber-300"
          hint={`de ${totals.openTasks} abiertas`}
        />
        <Stat
          label="Sin siguiente paso"
          value={totals.withoutNextStep}
          tone={totals.withoutNextStep > 0 ? "text-violet-300" : ""}
        />
        <Stat
          label="Valor en juego"
          value={`${Math.round(totals.valueUsd / 1000)}k`}
          hint="USD normalizado"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {(["EJECUTAR", "ESCALAR", "DECIDIR"] as QueueName[]).map((queue) => (
          <QueueColumn key={queue} queue={queue} items={queues[queue]} asOf={asOfKey} />
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle
            title="Anomalías del portafolio"
            hint="Cosas rotas que una hoja de cálculo no detecta"
          />
          {anomalies.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">Sin anomalías a esta fecha.</p>
          ) : (
            <ul className="divide-y divide-line">
              {anomalies.map(({ project, flag }) => (
                <li key={`${project.project.code}-${flag.code}`} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <FlagChip flag={flag} />
                    <ProjectLink
                      code={project.project.code}
                      name={project.project.name}
                      asOf={asOfKey}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted">{flag.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <SectionTitle
            title="Resumen del comité"
            hint="Redacción asistida sobre las colas ya calculadas"
          />
          <ExecutiveSummary asOf={asOfKey} />
        </Card>

        <Card>
          <SectionTitle
            title="Capacidad"
            hint={`Umbral de sobrecarga: ${portfolio.overloadThreshold} tareas abiertas`}
            right={
              <Link
                href={`/equipo?asOf=${asOfKey}`}
                className="text-xs text-muted underline-offset-2 hover:text-foreground hover:underline"
              >
                Ver equipo
              </Link>
            }
          />
          <div className="space-y-3 px-4 py-3">
            {overloaded.length > 0 && (
              <p className="text-sm">
                <strong className="text-amber-300">
                  {overloaded.map((m) => m.alias).join(", ")}
                </strong>{" "}
                {overloaded.length === 1 ? "está" : "están"} por encima del umbral de carga
                del equipo.
              </p>
            )}
            {ghosts.length > 0 && (
              <p className="text-sm">
                <strong className="text-violet-300">
                  {ghosts.map((m) => m.alias).join(", ")}
                </strong>{" "}
                {ghosts.length === 1 ? "tiene" : "tienen"} trabajo asignado pero no{" "}
                {ghosts.length === 1 ? "aparece" : "aparecen"} en la tabla de equipo: la
                capacidad real está mal contada.
              </p>
            )}
            <ul className="space-y-1.5">
              {team.map((member) => (
                <li key={member.alias} className="flex items-center gap-3 text-xs">
                  <span className="w-32 shrink-0 truncate">{member.alias}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded bg-surface-2">
                    <span
                      className={`block h-full rounded ${
                        member.isOverloaded ? "bg-amber-400" : "bg-sky-500"
                      }`}
                      style={{ width: `${(member.openTasks / maxLoad) * 100}%` }}
                    />
                  </span>
                  <span className="tabular w-20 shrink-0 text-right text-muted">
                    {member.openTasks} tareas
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </section>
    </div>
  );
}

function QueueColumn({
  queue,
  items,
  asOf,
}: {
  queue: QueueName;
  items: AnalyzedProject[];
  asOf: string;
}) {
  const style = QUEUE_STYLES[queue];

  return (
    <Card className="flex flex-col">
      <div className="border-b border-line px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className={`text-sm font-semibold ${style.accent}`}>{style.label}</h2>
          <span className="tabular text-sm text-muted">{items.length}</span>
        </div>
        <p className="mt-0.5 text-xs text-muted">{style.question}</p>
      </div>

      {items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted">Nada en esta cola.</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((item) => (
            <li key={item.project.code} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <ProjectLink
                  code={item.project.code}
                  name={item.project.name}
                  asOf={asOf}
                />
                <ScoreBadge score={item.score} />
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <HealthBadge health={item.health} />
                {item.flags
                  .filter((f) => f.code !== "BLOQUEADO" && f.code !== "EN_RIESGO")
                  .slice(0, 2)
                  .map((f) => (
                    <FlagChip key={f.code} flag={f} />
                  ))}
              </div>

              <p className="mt-1.5 text-xs text-muted">{item.queueReason}</p>

              <dl className="mt-2 space-y-0.5 text-xs">
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-muted">Siguiente paso</dt>
                  <dd className="flex-1">
                    {item.nextStep ? (
                      <>
                        {item.nextStep.text}
                        {item.nextStep.source === "derivado" && (
                          <span className="ml-1 text-muted">(derivado)</span>
                        )}
                      </>
                    ) : (
                      <span className="text-violet-300">sin definir</span>
                    )}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-muted">Responsable</dt>
                  <dd className="flex-1">{item.project.ownerAlias ?? "—"}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-muted">Fecha límite</dt>
                  <dd className="tabular flex-1">{formatDate(item.project.targetDate)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
