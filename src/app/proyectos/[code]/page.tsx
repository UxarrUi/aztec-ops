import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveAsOfDate, WEIGHTS } from "@/lib/config";
import { getProjectDetail, getTeam } from "@/lib/repository";
import { cleanTaskTitle } from "@/lib/graph";
import type { ScoreFactor } from "@/lib/types";
import {
  BlockerForm,
  NoteForm,
  OverrideForm,
  ProjectForm,
} from "@/components/forms";
import { NextStepDraft } from "@/components/ai";
import { BreakDependencyButton, TaskStatusSelect } from "@/components/TaskControls";
import {
  Card,
  Chip,
  FlagChip,
  HealthBadge,
  PriorityBadge,
  QUEUE_STYLES,
  ScoreBadge,
  SectionTitle,
  formatDate,
  formatUsd,
} from "@/components/ui";

export const dynamic = "force-dynamic";

const iso = (date: Date | null | undefined) =>
  date ? date.toISOString().slice(0, 10) : null;

/**
 * Ficha del proyecto.
 *
 * Cubre de golpe los dos requisitos centrales del enunciado — "crear y
 * actualizar proyectos" y "guardar responsable, estado, prioridad, fecha límite,
 * siguiente paso, bloqueos y notas" — y añade lo que hace defendible al sistema:
 * el desglose de por qué este proyecto está donde está en el ranking.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ asOf?: string }>;
}) {
  const { code } = await params;
  const { asOf: asOfParam } = await searchParams;
  const asOf = resolveAsOfDate(asOfParam);
  const asOfKey = asOf.toISOString().slice(0, 10);

  const detail = await getProjectDetail(code, asOf);
  if (!detail) notFound();

  const team = await getTeam();
  const { analyzed, portfolio, notes, activity, tasks, blockers, rank } = detail;
  const { project, breakdown } = analyzed;
  const queueStyle = QUEUE_STYLES[analyzed.queue];

  const members = team.map((m) => ({
    alias: m.alias,
    inSourceTeamSheet: m.inSourceTeamSheet,
  }));

  const openBlockers = blockers.filter((b) => b.resolvedAt === null);

  return (
    <div className="space-y-5">
      <nav className="text-xs text-muted">
        <Link href={`/proyectos?asOf=${asOfKey}`} className="hover:text-foreground">
          Proyectos
        </Link>
        <span className="mx-1.5">/</span>
        <span className="font-mono">{project.code}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-brand">{project.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {project.clientAlias} · {project.engagementType} · {project.projectTypeApi} ·
            etapa {project.stage}
          </p>
          {detail.summary && (
            <p className="mt-2 max-w-2xl text-sm text-muted">{detail.summary}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <Chip className={queueStyle.chip}>{queueStyle.label}</Chip>
            <HealthBadge health={analyzed.health} />
            <PriorityBadge
              priority={analyzed.effectivePriority}
              overridden={analyzed.priorityIsOverridden}
            />
          </div>
          <div className="text-right">
            <ScoreBadge score={analyzed.score} />
            <span className="ml-1 text-xs text-muted">
              · puesto {rank} de {portfolio.projects.length}
            </span>
          </div>
        </div>
      </header>

      <Card className="border-line/60 px-4 py-3">
        <p className="text-sm">
          <span className={queueStyle.accent}>{queueStyle.label}:</span>{" "}
          {analyzed.queueReason}
        </p>
      </Card>

      {analyzed.flags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {analyzed.flags.map((flag) => (
            <FlagChip key={flag.code} flag={flag} />
          ))}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
        <div className="space-y-5">
          <Card>
            <SectionTitle
              title="Datos operativos"
              hint="Los campos que el enunciado pide poder guardar"
            />
            <ProjectForm
              code={project.code}
              members={members}
              defaults={{
                name: project.name,
                status: project.status,
                stage: project.stage,
                ownerAlias: project.ownerAlias,
                targetDate: iso(project.targetDate),
                nextStep: project.nextStep,
                nextStepOwnerAlias: project.nextStepOwnerAlias,
                nextStepDueDate: iso(project.nextStepDueDate),
                derivedNextStep:
                  analyzed.nextStep?.source === "derivado"
                    ? analyzed.nextStep.text
                    : null,
              }}
            />
          </Card>

          <Card>
            <SectionTitle
              title="Tareas"
              hint={`${analyzed.openTasks.length} abiertas · ${analyzed.overdueTasks.length} vencidas · ${analyzed.blockedTasks.length} bloqueadas`}
            />
            {tasks.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted">
                Sin tareas. Por eso el sistema no puede derivar un siguiente paso.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {tasks.map((task) => {
                  const startable = analyzed.startableTasks.some((t) => t.code === task.code);
                  const inCycle = analyzed.cycles.flat().includes(task.code);
                  const overdue = analyzed.overdueTasks.some((t) => t.code === task.code);
                  const dependency = tasks.find((t) => t.id === task.dependsOnTaskId);

                  return (
                    <li key={task.id} className="px-4 py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm">
                            <span className="font-mono text-xs text-muted">
                              {task.code}
                            </span>{" "}
                            {cleanTaskTitle(task.title, project.name)}
                          </p>
                          <p className="mt-0.5 text-xs text-muted">
                            {task.status} · {task.priority} ·{" "}
                            {task.assignee?.alias ?? "sin asignar"} · vence{" "}
                            <span className="tabular">{formatDate(task.dueDate)}</span>
                          </p>
                          {dependency && (
                            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                              <span>
                                depende de{" "}
                                <span className="font-mono">{dependency.code}</span>{" "}
                                ({dependency.status})
                              </span>
                              <BreakDependencyButton
                                taskCode={task.code}
                                dependsOnCode={dependency.code}
                              />
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                          <TaskStatusSelect taskCode={task.code} status={task.status} />
                          <div className="flex flex-wrap justify-end gap-1">
                            {startable && (
                              <Chip className="bg-accent-soft text-accent-ink ring-accent-ring">
                                arrancable
                              </Chip>
                            )}
                            {inCycle && (
                              <Chip className="bg-violet-50 text-violet-800 ring-violet-200">
                                en ciclo
                              </Chip>
                            )}
                            {overdue && (
                              <Chip className="bg-amber-50 text-amber-800 ring-amber-200">
                                vencida
                              </Chip>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {analyzed.cycles.length > 0 && (
              <p className="border-t border-line px-4 py-2.5 text-xs text-violet-700">
                Dependencia circular: {analyzed.cycles[0].join(" → ")} →{" "}
                {analyzed.cycles[0][0]}. Esas tareas no pueden arrancar mientras el ciclo
                exista.
              </p>
            )}
          </Card>

          <Card>
            <SectionTitle
              title="Bloqueos"
              hint="Externo se escala · interno se trabaja"
            />
            {openBlockers.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted">Sin bloqueos abiertos.</p>
            ) : (
              <ul className="divide-y divide-line">
                {openBlockers.map((blocker) => (
                  <li key={blocker.id} className="px-4 py-2.5">
                    <div className="flex items-start gap-2">
                      <Chip
                        className={
                          blocker.kind === "EXTERNO"
                            ? "bg-amber-50 text-amber-800 ring-amber-200"
                            : "bg-sky-50 text-sky-800 ring-sky-200"
                        }
                      >
                        {blocker.kind}
                      </Chip>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">{blocker.description}</p>
                        <p className="mt-0.5 text-xs text-muted">
                          {blocker.owner?.alias ?? "sin dueño de escalación"}
                          {blocker.dueBy && ` · respuesta esperada ${formatDate(blocker.dueBy)}`}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {detail.blockersSource && (
              <p className="border-t border-line px-4 py-2 text-[11px] text-muted">
                Texto original del dataset: {detail.blockersSource}
              </p>
            )}
            <div className="border-t border-line">
              <BlockerForm code={project.code} members={members} />
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <SectionTitle
              title={`Por qué está en el puesto ${rank}`}
              hint="Score de 100 puntos — así se compone"
              right={<ScoreBadge score={analyzed.score} />}
            />
            <div className="space-y-3 px-4 py-3">
              <Factor name="Urgencia" factor={breakdown.urgency} weight={WEIGHTS.urgency} />
              <Factor name="Riesgo" factor={breakdown.risk} weight={WEIGHTS.risk} />
              <Factor name="Valor" factor={breakdown.value} weight={WEIGHTS.value} />
              <div className="flex justify-between border-t border-line pt-2 text-sm">
                <span className="text-muted">Total</span>
                <span className="tabular font-semibold">
                  {breakdown.total.toFixed(1)} / 100
                </span>
              </div>
              <p className="text-[11px] text-muted">
                El valor pesa menos que urgencia y riesgo a propósito: un proyecto caro que
                va bien no necesita atención hoy.
              </p>
            </div>
          </Card>

          <Card>
            <SectionTitle
              title="Redacción asistida"
              hint="La IA redacta, no decide"
            />
            <NextStepDraft code={project.code} asOf={asOfKey} />
          </Card>

          <Card>
            <SectionTitle title="Prioridad manual" hint="Requiere razón escrita" />
            <OverrideForm
              code={project.code}
              currentPriority={project.priorityOverride}
              currentReason={project.overrideReason}
              computedPriority={
                analyzed.priorityIsOverridden ? "otra cosa" : analyzed.effectivePriority
              }
              score={analyzed.score}
            />
            {analyzed.priorityIsOverridden && project.overrideReason && (
              <p className="border-t border-line px-4 py-2.5 text-xs text-muted">
                Razón registrada: «{project.overrideReason}»
              </p>
            )}
          </Card>

          <Card>
            <SectionTitle title="Ficha" />
            <dl className="divide-y divide-line text-sm">
              <Row label="Valor de negocio">
                {formatUsd(project.businessValueUsd)}
                {detail.currency === "COP" && detail.businessValue && (
                  <span className="ml-1 text-xs text-muted">
                    ({detail.businessValue.toLocaleString("es-CO")} COP)
                  </span>
                )}
              </Row>
              <Row label="Inicio">{formatDate(project.startDate)}</Row>
              <Row label="Fecha límite">{formatDate(project.targetDate)}</Row>
              <Row label="Salud declarada en la fuente">
                {project.healthSource}
                {project.healthSource !== analyzed.health && (
                  <span className="ml-1 text-xs text-amber-700">
                    (recalculada: {analyzed.health})
                  </span>
                )}
              </Row>
              {detail.recentCompleted && (
                <Row label="Completado recientemente">{detail.recentCompleted}</Row>
              )}
            </dl>
          </Card>

          <Card>
            <SectionTitle title="Notas" hint={`${notes.length} registradas`} />
            <NoteForm code={project.code} />
            {notes.length > 0 && (
              <ul className="divide-y divide-line border-t border-line">
                {notes.map((note) => (
                  <li key={note.id} className="px-4 py-2.5">
                    <p className="text-sm">{note.body}</p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {note.author} · {formatDate(note.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <SectionTitle
              title="Historial"
              hint="Qué cambió, quién y por qué"
            />
            {activity.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted">Sin cambios registrados.</p>
            ) : (
              <ul className="divide-y divide-line">
                {activity.map((entry) => (
                  <li key={entry.id} className="px-4 py-2 text-xs">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-muted">
                        {entry.actor} · {entry.action.toLowerCase()}
                        {entry.field && ` · ${entry.field}`}
                      </span>
                      <span className="tabular shrink-0 text-muted">
                        {formatDate(entry.createdAt)}
                      </span>
                    </div>
                    {(entry.oldValue || entry.newValue) && (
                      <p className="mt-0.5">
                        {entry.oldValue && (
                          <span className="text-muted line-through">{entry.oldValue}</span>
                        )}
                        {entry.oldValue && entry.newValue && " → "}
                        {entry.newValue}
                      </p>
                    )}
                    {entry.reason && (
                      <p className="mt-0.5 text-muted">Razón: {entry.reason}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Factor({
  name,
  factor,
  weight,
}: {
  name: string;
  factor: ScoreFactor;
  weight: number;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span>
          {name} <span className="text-xs text-muted">× {weight}</span>
        </span>
        <span className="tabular text-muted">
          {factor.value.toFixed(2)} → {factor.points.toFixed(1)} pts
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-brand"
          style={{ width: `${Math.min(100, factor.value * 100)}%` }}
        />
      </div>
      <p className="mt-1 text-[11px] text-muted">{factor.explanation}</p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 px-4 py-2">
      <dt className="w-44 shrink-0 text-xs text-muted">{label}</dt>
      <dd className="flex-1 text-sm">{children}</dd>
    </div>
  );
}
